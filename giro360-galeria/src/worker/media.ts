import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import sharp from "sharp";
import { q, q1, tx } from "@/lib/db";
import { config } from "@/lib/config";
import * as storage from "@/lib/storage";
import { getEvent } from "@/lib/events";
import { isEligibleForIndex, queueIndexing, type MediaRow } from "@/lib/media";

export class PermanentError extends Error {}

export function run(cmd: string, args: string[], timeoutMs = 20 * 60_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    const timer = setTimeout(() => p.kill("SIGKILL"), timeoutMs);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err = (err + d).slice(-4000)));
    p.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    p.on("close", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve(out) : reject(new Error(`${cmd} saiu com código ${code}: ${err.slice(-800)}`));
    });
  });
}

export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "giro360-"));
  try {
    return await fn(dir);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

/** Baixa o original para um arquivo temporário calculando o SHA-256 no caminho. */
export async function downloadOriginal(key: string, dest: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  const src = await storage.getObjectStream(key);
  src.on("data", (c) => hash.update(c));
  await pipeline(src, fs.createWriteStream(dest));
  return hash.digest("hex");
}

export function sniffType(head: Buffer): "jpeg" | "png" | "isobmff" | null {
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpeg";
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  // MP4 e MOV (QuickTime) usam a estrutura ISO BMFF: tamanho (4 bytes) + tipo de caixa.
  const box = head.subarray(4, 8).toString("latin1");
  if (["ftyp", "moov", "mdat", "wide", "free", "skip"].includes(box)) return "isobmff";
  return null;
}

export type ProbeInfo = { durationSec: number; width: number | null; height: number | null; rotation: number };

export async function probe(file: string): Promise<ProbeInfo> {
  const out = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], 120_000);
  const j = JSON.parse(out);
  const v = (j.streams ?? []).find((s: any) => s.codec_type === "video");
  if (!v) throw new PermanentError("O arquivo não contém trilha de vídeo.");
  const rotTag = Number(v.tags?.rotate ?? 0);
  const rotSide = Number((v.side_data_list ?? []).find((d: any) => d.rotation !== undefined)?.rotation ?? 0);
  const rotation = Math.abs(rotTag || rotSide) % 180 === 90 ? 90 : 0;
  const w = v.width ?? null;
  const h = v.height ?? null;
  return {
    durationSec: Number(j.format?.duration ?? v.duration ?? 0),
    width: rotation ? h : w,
    height: rotation ? w : h,
    rotation,
  };
}

/** Extrai um quadro (JPEG) em um instante do vídeo. -ss antes de -i = busca rápida. */
export async function extractFrame(file: string, atSec: number, dest: string, maxSide = 1920) {
  await run(
    "ffmpeg",
    ["-v", "error", "-y", "-ss", atSec.toFixed(3), "-i", file, "-frames:v", "1",
      "-vf", `scale='min(${maxSide},iw)':'min(${maxSide},ih)':force_original_aspect_ratio=decrease`, "-q:v", "3", dest],
    120_000,
  );
  if (!fs.existsSync(dest)) throw new Error(`Quadro não extraído em ${atSec}s`);
}

async function putFile(key: string, file: string, type: string) {
  await storage.putObject(key, fs.createReadStream(file), type);
  return (await fsp.stat(file)).size;
}

async function putBuf(key: string, buf: Buffer, type: string) {
  await storage.putObject(key, buf, type);
  return buf.length;
}

/**
 * Processa uma mídia recebida: confere o conteúdo, elimina duplicatas exatas (mesmo SHA-256 no evento),
 * gera miniatura e prévia leves e marca como disponível. Cada arquivo fica disponível sozinho, sem esperar o lote.
 */
export async function processMedia(mediaId: string) {
  const m = await q1<MediaRow>("select * from media where id=$1", [mediaId]);
  if (!m) return; // excluída nesse meio-tempo
  if (!["received", "processing"].includes(m.status)) return; // idempotente
  await q("update media set status='processing', updated_at=now() where id=$1", [mediaId]);

  await withTempDir(async (dir) => {
    const src = path.join(dir, "original");
    const sha = await downloadOriginal(m.storage_key, src);
    const size = (await fsp.stat(src)).size;
    if (size !== Number(m.size_bytes)) throw new Error(`Tamanho divergente no armazenamento (${size} ≠ ${m.size_bytes})`);

    // Duplicata exata no mesmo evento: guarda só um original e não cobra IA de novo.
    const dup = await tx(async (c) => {
      await c.query("select pg_advisory_xact_lock(hashtext($1))", [`${m.event_id}:${sha}`]);
      const other = await c.query<{ id: string }>(
        `select id from media where event_id=$1 and sha256=$2 and id<>$3 and status in ('received','processing','ready')
         order by created_at limit 1`,
        [m.event_id, sha, m.id],
      );
      await c.query("update media set sha256=$2 where id=$1", [m.id, sha]);
      if (other.rows[0]) {
        await c.query("update media set status='duplicate', duplicate_of=$2, updated_at=now() where id=$1", [m.id, other.rows[0].id]);
        await c.query("insert into deletion_tasks(event_id, target, ref) values ($1,'object',$2)", [
          m.event_id,
          JSON.stringify({ key: m.storage_key }),
        ]);
        return other.rows[0].id;
      }
      return null;
    });
    if (dup) return;

    const fd = await fsp.open(src, "r");
    const head = Buffer.alloc(16);
    await fd.read(head, 0, 16, 0);
    await fd.close();
    const sniff = sniffType(head);
    const expected = m.kind === "photo" ? (m.content_type === "image/png" ? "png" : "jpeg") : "isobmff";
    if (sniff !== expected) throw new PermanentError("O conteúdo do arquivo não corresponde a uma foto JPEG/PNG ou vídeo MP4/MOV.");

    const derivedKey = (n: string) => storage.keys.derived(m.event_id, m.id, n);
    let derived = 0;
    let width: number | null = null;
    let height: number | null = null;
    let duration: number | null = null;
    let thumbKey: string, previewKey: string, posterKey: string | null = null;

    if (m.kind === "photo") {
      const img = sharp(src, { failOn: "error" }).rotate();
      const meta = await sharp(src).rotate().metadata();
      const oriented = (meta.orientation ?? 1) >= 5;
      width = (oriented ? meta.height : meta.width) ?? null;
      height = (oriented ? meta.width : meta.height) ?? null;
      thumbKey = derivedKey("thumb.webp");
      previewKey = derivedKey("preview.webp");
      derived += await putBuf(thumbKey, await img.clone().resize(480, 480, { fit: "cover" }).webp({ quality: 72 }).toBuffer(), "image/webp");
      derived += await putBuf(
        previewKey,
        await img.clone().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(),
        "image/webp",
      );
    } else {
      const info = await probe(src);
      width = info.width;
      height = info.height;
      duration = info.durationSec;
      const frame = path.join(dir, "poster.jpg");
      await extractFrame(src, Math.min(1, Math.max(0, info.durationSec / 3)), frame, 1600);
      thumbKey = derivedKey("thumb.webp");
      posterKey = derivedKey("poster.webp");
      previewKey = derivedKey("preview.mp4");
      derived += await putBuf(thumbKey, await sharp(frame).resize(480, 480, { fit: "cover" }).webp({ quality: 72 }).toBuffer(), "image/webp");
      derived += await putBuf(posterKey, await sharp(frame).resize(1280, 1280, { fit: "inside" }).webp({ quality: 78 }).toBuffer(), "image/webp");
      // Prévia leve (H.264, até 720p) para assistir no 4G; o original (inclusive HEVC/MOV) fica para download.
      const prev = path.join(dir, "preview.mp4");
      await run("ffmpeg", [
        "-v", "error", "-y", "-i", src,
        "-vf", "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))'",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", "-profile:v", "main",
        "-c:a", "aac", "-b:a", "96k", "-ac", "2", "-movflags", "+faststart", prev,
      ]);
      derived += await putFile(previewKey, prev, "video/mp4");
    }

    await q(
      `update media set status='ready', ready_at=now(), error=null, width=$2, height=$3, duration_sec=$4,
         thumb_key=$5, preview_key=$6, poster_key=$7, derived_bytes=$8, updated_at=now() where id=$1`,
      [m.id, width, height, duration, thumbKey, previewKey, posterKey, derived],
    );
  });

  const fresh = await q1<MediaRow>("select * from media where id=$1", [mediaId]);
  if (fresh && fresh.status === "ready") {
    const event = await getEvent(fresh.event_id);
    if (isEligibleForIndex(event, fresh)) await queueIndexing(fresh.id, fresh.event_id);
  }
}

export async function markProcessingFailed(mediaId: string, message: string) {
  await q("update media set status='failed', error=$2, updated_at=now() where id=$1 and status in ('received','processing')", [
    mediaId,
    message.slice(0, 500),
  ]);
}

export { config };
