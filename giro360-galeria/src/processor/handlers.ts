import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { config } from "@/lib/config";
import * as storage from "@/lib/storage";
import { FaceProviderError } from "@/lib/faces/types";
import type * as P from "@/lib/processor-types";
import { cachedOriginal, dropCached, extractFrame, PermanentError, probe, readHead, run, sniffType, withTempDir } from "./media-tools";
import { mockDetect } from "./mock-detect";
import { RekognitionProvider } from "./rekognition";

/**
 * Trabalho pesado executado no Container (Node + FFmpeg + sharp). Não acessa o banco:
 * recebe referências, lê/grava no armazenamento e devolve resultados para o Worker gravar no D1.
 * As mesmas funções são chamadas diretamente nos testes e scripts locais.
 */

let rek: RekognitionProvider | null = null;
const rekognition = () => (rek ??= new RekognitionProvider());

async function putBuf(key: string, buf: Buffer, type: string) {
  await storage.putObject(key, buf, type);
  return buf.length;
}

/** Confere o conteúdo, calcula o SHA-256 e gera miniatura e prévia leves. */
export async function processMedia(r: P.ProcessRequest): Promise<P.ProcessResult> {
  const { file, sha256 } = await cachedOriginal(r.mediaId, r.storageKey, r.sizeBytes);
  const sniff = sniffType(await readHead(file));
  const expected = r.kind === "photo" ? (r.contentType === "image/png" ? "png" : "jpeg") : "isobmff";
  if (sniff !== expected) throw new PermanentError("O conteúdo do arquivo não corresponde a uma foto JPEG/PNG ou vídeo MP4/MOV.");
  const derivedKey = (n: string) => storage.keys.derived(r.eventId, r.mediaId, n);
  let derivedBytes = 0;

  if (r.kind === "photo") {
    const img = sharp(file, { failOn: "error" }).rotate();
    const meta = await sharp(file).metadata();
    const turned = (meta.orientation ?? 1) >= 5;
    const thumbKey = derivedKey("thumb.webp");
    const previewKey = derivedKey("preview.webp");
    derivedBytes += await putBuf(thumbKey, await img.clone().resize(480, 480, { fit: "cover" }).webp({ quality: 72 }).toBuffer(), "image/webp");
    derivedBytes += await putBuf(previewKey, await img.clone().resize(1600, 1600, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer(), "image/webp");
    return {
      sha256,
      width: (turned ? meta.height : meta.width) ?? null,
      height: (turned ? meta.width : meta.height) ?? null,
      durationSec: null,
      thumbKey,
      previewKey,
      posterKey: null,
      derivedBytes,
    };
  }

  return withTempDir(async (dir) => {
    const info = await probe(file);
    const frame = path.join(dir, "poster.jpg");
    await extractFrame(file, Math.min(1, Math.max(0, info.durationSec / 3)), frame, 1600);
    const thumbKey = derivedKey("thumb.webp");
    const posterKey = derivedKey("poster.webp");
    const previewKey = derivedKey("preview.mp4");
    derivedBytes += await putBuf(thumbKey, await sharp(frame).resize(480, 480, { fit: "cover" }).webp({ quality: 72 }).toBuffer(), "image/webp");
    derivedBytes += await putBuf(posterKey, await sharp(frame).resize(1280, 1280, { fit: "inside" }).webp({ quality: 78 }).toBuffer(), "image/webp");
    // Prévia leve (H.264, até 720p) para assistir no 4G; o original (inclusive HEVC/MOV) fica para download.
    const prev = path.join(dir, "preview.mp4");
    await run("ffmpeg", [
      "-v", "error", "-y", "-i", file,
      "-vf", "scale='if(gt(iw,ih),min(1280,iw),-2)':'if(gt(iw,ih),-2,min(1280,ih))'",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-pix_fmt", "yuv420p", "-profile:v", "main",
      "-c:a", "aac", "-b:a", "96k", "-ac", "2", "-movflags", "+faststart", prev,
    ]);
    derivedBytes += await putBuf(previewKey, await fsp.readFile(prev), "video/mp4");
    return { sha256, width: info.width, height: info.height, durationSec: info.durationSec, thumbKey, previewKey, posterKey, derivedBytes };
  });
}

/** Envia UMA unidade (foto inteira ou um quadro) à IA e devolve os rostos indexados. */
export async function indexUnit(r: P.IndexUnitRequest): Promise<P.IndexUnitResult> {
  const { file } = await cachedOriginal(r.mediaId, r.storageKey, r.sizeBytes);
  let image: Buffer;
  if (r.atSec === null) {
    image = await sharp(file).rotate().resize(1920, 1920, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
  } else {
    image = await withTempDir(async (dir) => {
      const f = path.join(dir, "frame.jpg");
      await extractFrame(file, r.atSec!, f);
      return fsp.readFile(f);
    });
  }
  if (r.provider === "mock") {
    const faces = await mockDetect(image);
    return { faces: faces.map((f) => ({ faceId: crypto.randomUUID(), confidence: f.confidence, bbox: f.bbox, persona: f.persona })) };
  }
  try {
    if (r.ensureCollection) await rekognition().ensureCollection(r.collectionId);
    return { faces: await rekognition().indexFaces(r.collectionId, image, r.mediaId) };
  } catch (err) {
    if (err instanceof FaceProviderError && !err.retryable) throw new PermanentError(err.message);
    throw err;
  }
}

/** Libera o espaço local de uma mídia ao fim do processamento. */
export async function releaseMedia(mediaId: string) {
  await dropCached(mediaId);
}

/**
 * Selfie: só em memória. Mede o brilho, detecta rostos e (Rekognition) busca na coleção do evento.
 * Nada é gravado em disco, no armazenamento ou em log.
 */
export async function selfie(r: P.SelfieRequest, imageBytes: Buffer): Promise<P.SelfieResult> {
  let img: Buffer;
  let brightness: number;
  try {
    img = await sharp(imageBytes, { failOn: "error" }).rotate().resize(1280, 1280, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
    brightness = (await sharp(img).greyscale().stats()).channels[0].mean;
  } catch {
    return { ok: false, code: "bad_image" };
  }
  if (brightness < 45) return { ok: false, code: "too_dark" };
  if (r.provider === "mock") {
    const faces = await mockDetect(img);
    return { ok: true, faces: faces.map((f) => ({ confidence: f.confidence, bbox: f.bbox, persona: f.persona })), matches: null, searched: false };
  }
  try {
    const faces = await rekognition().detectFaces(img);
    const relevant = faces.filter((f) => f.confidence >= 90 && f.bbox.width * f.bbox.height >= 0.01);
    if (relevant.length !== 1 || !r.collectionId) return { ok: true, faces, matches: null, searched: false };
    const matches = await rekognition().searchByImage(r.collectionId, img, r.threshold, r.maxFaces);
    return { ok: true, faces, matches, searched: true };
  } catch (err) {
    return { ok: false, code: "provider_error", message: (err as Error).message };
  }
}

/** Capa do evento: versão grande (1920) e miniatura (800) em WebP, a partir do arquivo enviado. */
export async function cover(r: P.CoverRequest): Promise<P.CoverResult> {
  const input = Buffer.from(await storage.getObjectBuffer(r.sourceKey));
  let big: Buffer, small: Buffer;
  try {
    const img = sharp(input, { failOn: "error" }).rotate();
    big = await img.clone().resize(1920, 1200, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    small = await img.clone().resize(800, 500, { fit: "cover" }).webp({ quality: 75 }).toBuffer();
  } catch {
    throw new PermanentError("Não foi possível ler a imagem da capa. Use JPEG ou PNG.");
  }
  const id = crypto.randomUUID();
  const coverKey = storage.keys.cover(r.eventId, id, "webp");
  const thumbKey = storage.keys.cover(r.eventId, `${id}-thumb`, "webp");
  await storage.putObject(coverKey, big, "image/webp");
  await storage.putObject(thumbKey, small, "image/webp");
  await storage.deleteObject(r.sourceKey).catch(() => undefined);
  return { coverKey, thumbKey };
}

export async function deleteFaces(r: P.DeleteFacesRequest) {
  if (r.provider === "mock") return;
  await rekognition().deleteFaces(r.collectionId, r.faceIds);
}

export async function deleteCollection(r: P.DeleteCollectionRequest) {
  if (r.provider === "mock") return;
  await rekognition().deleteCollection(r.collectionId);
}

export const providerName = () => config().FACE_PROVIDER;
