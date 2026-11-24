import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as storage from "@/lib/storage";

/** Erro que não adianta repetir (arquivo inválido, formato errado). */
export class PermanentError extends Error {
  permanent = true;
}

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

export const WORK_DIR = process.env.PROCESSOR_WORK_DIR ?? path.join(os.tmpdir(), "giro360-work");

export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  await fsp.mkdir(WORK_DIR, { recursive: true });
  const dir = await fsp.mkdtemp(path.join(WORK_DIR, "job-"));
  try {
    return await fn(dir);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

/** Baixa o original para um arquivo local calculando o SHA-256 no caminho. */
export async function downloadOriginal(key: string, dest: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  const res = await storage.getObject(key);
  if (!res.body) throw new Error("Armazenamento retornou corpo vazio");
  const src = Readable.fromWeb(res.body as any);
  src.on("data", (c) => hash.update(c));
  await pipeline(src, fs.createWriteStream(dest));
  return hash.digest("hex");
}

/**
 * Cópia local do original, reaproveitada entre chamadas do mesmo container (ex.: vários quadros do mesmo vídeo).
 * Confere o tamanho para não usar um arquivo incompleto.
 */
export async function cachedOriginal(mediaId: string, key: string, size: number): Promise<{ file: string; sha256: string }> {
  const dir = path.join(WORK_DIR, "cache");
  await fsp.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${mediaId}.bin`);
  const shaFile = `${file}.sha256`;
  try {
    const st = await fsp.stat(file);
    if (st.size === size && fs.existsSync(shaFile)) return { file, sha256: await fsp.readFile(shaFile, "utf8") };
  } catch {
    /* ainda não baixado */
  }
  const tmp = `${file}.part-${process.pid}-${Date.now()}`;
  const sha256 = await downloadOriginal(key, tmp);
  const st = await fsp.stat(tmp);
  if (st.size !== size) {
    await fsp.rm(tmp, { force: true });
    throw new Error(`Tamanho divergente no armazenamento (${st.size} ≠ ${size})`);
  }
  await fsp.rename(tmp, file);
  await fsp.writeFile(shaFile, sha256);
  return { file, sha256 };
}

export async function dropCached(mediaId: string) {
  const file = path.join(WORK_DIR, "cache", `${mediaId}.bin`);
  await fsp.rm(file, { force: true });
  await fsp.rm(`${file}.sha256`, { force: true });
}

export function sniffType(head: Buffer): "jpeg" | "png" | "isobmff" | null {
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpeg";
  if (head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  // MP4 e MOV (QuickTime) usam a estrutura ISO BMFF: tamanho (4 bytes) + tipo de caixa.
  const box = head.subarray(4, 8).toString("latin1");
  if (["ftyp", "moov", "mdat", "wide", "free", "skip"].includes(box)) return "isobmff";
  return null;
}

export async function readHead(file: string, n = 16) {
  const fd = await fsp.open(file, "r");
  try {
    const head = Buffer.alloc(n);
    await fd.read(head, 0, n, 0);
    return head;
  } finally {
    await fd.close();
  }
}

export type ProbeInfo = { durationSec: number; width: number | null; height: number | null };

export async function probe(file: string): Promise<ProbeInfo> {
  const out = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file], 120_000);
  const j = JSON.parse(out);
  const v = (j.streams ?? []).find((s: any) => s.codec_type === "video");
  if (!v) throw new PermanentError("O arquivo não contém trilha de vídeo.");
  const rotTag = Number(v.tags?.rotate ?? 0);
  const rotSide = Number((v.side_data_list ?? []).find((d: any) => d.rotation !== undefined)?.rotation ?? 0);
  const rotated = Math.abs(rotTag || rotSide) % 180 === 90;
  const w = v.width ?? null;
  const h = v.height ?? null;
  return { durationSec: Number(j.format?.duration ?? v.duration ?? 0), width: rotated ? h : w, height: rotated ? w : h };
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
