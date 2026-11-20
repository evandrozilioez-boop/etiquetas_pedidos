import sharp from "sharp";
import { config } from "../config";
import { q, q1 } from "../db";
import { HttpError } from "../http";
import { faceOpen, type EventRow } from "../events";
import { grantMedia, toPublicMedia, type GuestSession, type PublicMedia } from "../access";
import type { MediaRow } from "../media";
import { faceProvider } from "./index";
import { groupMatches, type FaceRef } from "./grouping";
import { FaceProviderError } from "./types";

export type SearchOutcome =
  | { status: "matches"; items: PublicMedia[]; pending: number }
  | { status: "no_match"; pending: number }
  | { status: "processing"; pending: number };

/** Prepara a selfie em memória: corrige rotação, reduz e mede brilho. Nada é gravado em disco ou em log. */
export async function prepareSelfie(input: Buffer) {
  let img: Buffer;
  let brightness: number;
  try {
    const pipeline = sharp(input, { failOn: "error" }).rotate().resize(1280, 1280, { fit: "inside", withoutEnlargement: true });
    img = await pipeline.clone().jpeg({ quality: 88 }).toBuffer();
    const stats = await sharp(img).greyscale().stats();
    brightness = stats.channels[0].mean;
  } catch {
    throw new HttpError(422, "Não conseguimos abrir essa imagem. Envie uma foto em JPEG ou PNG.", "bad_image");
  }
  if (brightness < 45) {
    throw new HttpError(422, "A foto está muito escura. Procure um lugar mais iluminado e tente de novo.", "too_dark");
  }
  return img;
}

async function countUsage(eventId: string, kind: "search" | "detect_selfie") {
  await q("insert into ai_usage(event_id, kind, units, provider) values ($1,$2,1,$3)", [eventId, kind, faceProvider().name]);
}

/** Quantas mídias autorizadas ainda não terminaram de entrar na busca. */
async function pendingCount(eventId: string) {
  const r = await q1<{ n: string }>(
    `select count(*) as n from media where event_id=$1 and published and consent_status='granted_all'
       and (status in ('uploading','received','processing') or face_status in ('queued','indexing'))`,
    [eventId],
  );
  return Number(r?.n ?? 0);
}

export async function searchBySelfie(event: EventRow, session: GuestSession, raw: Buffer): Promise<SearchOutcome> {
  if (!faceOpen(event)) {
    throw new HttpError(409, "A busca por selfie não está disponível neste evento.", "face_disabled");
  }
  let selfie: Buffer | null = await prepareSelfie(raw);
  const cfg = config();
  const provider = faceProvider();
  try {
    let faces;
    try {
      faces = await provider.detectFaces(selfie);
    } finally {
      await countUsage(event.id, "detect_selfie");
    }
    const relevant = faces.filter((f) => f.confidence >= 90 && f.bbox.width * f.bbox.height >= 0.01);
    if (relevant.length === 0) {
      throw new HttpError(422, "Não encontramos um rosto nesta foto. Envie uma foto de frente, com o rosto inteiro aparecendo.", "no_face");
    }
    if (relevant.length > 1) {
      throw new HttpError(422, "Encontramos mais de um rosto. Envie uma foto em que apareça apenas você.", "multiple_faces");
    }

    const pending = await pendingCount(event.id);
    if (!event.face_collection_id) {
      return logged(event.id, pending > 0 ? { status: "processing", pending } : { status: "no_match", pending });
    }

    let matches;
    try {
      matches = await provider.searchByImage(event.face_collection_id, selfie, cfg.FACE_MATCH_THRESHOLD, cfg.FACE_SEARCH_MAX_FACES);
    } finally {
      await countUsage(event.id, "search");
    }

    // Só contam rostos registrados para ESTE evento, de mídias publicadas e prontas.
    const faceIds = matches.map((m) => m.faceId);
    const refs = new Map<string, FaceRef>();
    if (faceIds.length) {
      const rows = await q<{ face_id: string; media_id: string; frame_ms: number | null }>(
        `select fr.face_id, fr.media_id, fr.frame_ms from face_records fr join media m on m.id = fr.media_id
         where fr.event_id=$1 and fr.face_id = any($2) and m.event_id=$1 and m.published and m.status='ready'`,
        [event.id, faceIds],
      );
      for (const r of rows) refs.set(r.face_id, { mediaId: r.media_id, frameMs: r.frame_ms });
    }
    const grouped = groupMatches(matches, refs, cfg.FACE_MATCH_THRESHOLD, cfg.FACE_MAX_RESULTS);
    if (!grouped.length) {
      return logged(event.id, pending > 0 ? { status: "processing", pending } : { status: "no_match", pending });
    }
    const ids = grouped.map((g) => g.mediaId);
    const media = await q<MediaRow>("select * from media where id = any($1)", [ids]);
    const byId = new Map(media.map((m) => [m.id, m]));
    const items: PublicMedia[] = [];
    for (const g of grouped) {
      const m = byId.get(g.mediaId);
      if (!m) continue;
      items.push({ ...(await toPublicMedia(m)), similarity: Math.round(g.similarity * 10) / 10 });
    }
    await grantMedia(session.id, ids);
    return logged(event.id, { status: "matches", items, pending });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if (err instanceof FaceProviderError) {
      console.error("[busca] provedor indisponível:", err.message);
      await q("insert into search_logs(event_id, outcome) values ($1,'error')", [event.id]);
      throw new HttpError(503, "Falha temporária na busca. Tente de novo em alguns instantes.", "search_unavailable");
    }
    throw err;
  } finally {
    // Descarta a selfie: a referência ao buffer é removida assim que a busca termina.
    selfie = null;
  }
}

async function logged<T extends SearchOutcome>(eventId: string, outcome: T): Promise<T> {
  await q("insert into search_logs(event_id, outcome, match_count) values ($1,$2,$3)", [
    eventId,
    outcome.status,
    outcome.status === "matches" ? outcome.items.length : 0,
  ]);
  return outcome;
}
