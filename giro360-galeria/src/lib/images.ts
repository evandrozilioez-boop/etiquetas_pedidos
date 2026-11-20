import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { HttpError } from "./http";
import * as storage from "./storage";

const MAX_BYTES = 20 * 1024 * 1024;

export async function readImageFromForm(req: Request, field = "file"): Promise<Buffer> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES + 1024 * 1024) throw new HttpError(413, "Imagem acima de 20 MB.");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "Envie a imagem como formulário.");
  }
  const file = form.get(field);
  if (!(file instanceof Blob) || file.size === 0) throw new HttpError(400, "Selecione uma imagem.");
  if (file.size > MAX_BYTES) throw new HttpError(413, "Imagem acima de 20 MB.");
  return Buffer.from(await file.arrayBuffer());
}

/** Capa do evento: versão grande (1920) e miniatura (800), em WebP. O arquivo enviado não é guardado. */
export async function storeCover(eventId: string, input: Buffer) {
  try {
    const img = sharp(input, { failOn: "error" }).rotate();
    const id = randomUUID();
    const big = await img.clone().resize(1920, 1200, { fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    const small = await img.clone().resize(800, 500, { fit: "cover" }).webp({ quality: 75 }).toBuffer();
    const coverKey = storage.keys.cover(eventId, id, "webp");
    const thumbKey = storage.keys.cover(eventId, `${id}-thumb`, "webp");
    await storage.putObject(coverKey, big, "image/webp");
    await storage.putObject(thumbKey, small, "image/webp");
    return { coverKey, thumbKey };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(422, "Não foi possível ler a imagem. Use JPEG ou PNG.");
  }
}

/** Logo: preserva transparência, até 600 px. */
export async function storeLogo(input: Buffer) {
  try {
    const out = await sharp(input, { failOn: "error" }).resize(600, 600, { fit: "inside", withoutEnlargement: true }).png().toBuffer();
    const key = storage.keys.logo(randomUUID(), "png");
    await storage.putObject(key, out, "image/png");
    return key;
  } catch {
    throw new HttpError(422, "Não foi possível ler a imagem. Use PNG (de preferência com fundo transparente) ou JPEG.");
  }
}
