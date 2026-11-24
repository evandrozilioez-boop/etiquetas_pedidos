import { config } from "../config";
import { q, q1 } from "../db";
import { HttpError } from "../http";
import { faceOpen, type EventRow } from "../events";
import { grantMedia, toPublicMedia, type GuestSession, type PublicMedia } from "../access";
import type { MediaRow } from "../media";
import { processor } from "../processor";
import { groupMatches, type FaceRef } from "./grouping";
import type { FaceMatch } from "./types";

export type SearchOutcome =
  | { status: "matches"; items: PublicMedia[]; pending: number }
  | { status: "no_match"; pending: number }
  | { status: "processing"; pending: number };

async function countUsage(eventId: string, kind: "search" | "detect_selfie") {
  await q("insert into ai_usage(event_id, kind, units, provider) values ($1,$2,1,$3)", [eventId, kind, config().FACE_PROVIDER]);
}

/** Quantas mídias autorizadas ainda não terminaram de entrar na busca. */
async function pendingCount(eventId: string) {
  const r = await q1<{ n: number }>(
    `select count(*) as n from media where event_id=$1 and published = 1 and consent_status='granted_all'
       and (status in ('uploading','received','processing') or face_status in ('queued','indexing'))`,
    [eventId],
  );
  return Number(r?.n ?? 0);
}

const unavailable = () => new HttpError(503, "Falha temporária na busca. Tente de novo em alguns instantes.", "search_unavailable");

/**
 * Busca por selfie no índice já criado do evento. A selfie vai em memória ao processador e é descartada;
 * não é gravada em disco, no armazenamento ou em logs.
 */
export async function searchBySelfie(event: EventRow, session: GuestSession, raw: Uint8Array): Promise<SearchOutcome> {
  if (!faceOpen(event)) throw new HttpError(409, "A busca por selfie não está disponível neste evento.", "face_disabled");
  const cfg = config();
  if (cfg.FACE_PROVIDER === "none") throw new HttpError(409, "A busca por selfie não está disponível neste evento.", "face_disabled");
  let result;
  try {
    result = await (await processor()).selfie({ provider: cfg.FACE_PROVIDER, collectionId: event.face_collection_id, threshold: cfg.FACE_MATCH_THRESHOLD, maxFaces: cfg.FACE_SEARCH_MAX_FACES }, raw);
  } catch (err) {
    console.error("[busca] processador indisponível:", (err as Error).message);
    await q("insert into search_logs(event_id, outcome) values ($1,'error')", [event.id]);
    throw unavailable();
  }
  if (!result.ok) {
    if (result.code === "too_dark") throw new HttpError(422, "A foto está muito escura. Procure um lugar mais iluminado e tente de novo.", "too_dark");
    if (result.code === "bad_image") throw new HttpError(422, "Não conseguimos abrir essa imagem. Envie uma foto em JPEG ou PNG.", "bad_image");
    console.error("[busca] provedor indisponível:", result.message);
    await q("insert into search_logs(event_id, outcome) values ($1,'error')", [event.id]);
    throw unavailable();
  }
  await countUsage(event.id, "detect_selfie");
  const relevant = result.faces.filter((f) => f.confidence >= 90 && f.bbox.width * f.bbox.height >= 0.01);
  if (relevant.length === 0) throw new HttpError(422, "Não encontramos um rosto nesta foto. Envie uma foto de frente, com o rosto inteiro aparecendo.", "no_face");
  if (relevant.length > 1) throw new HttpError(422, "Encontramos mais de um rosto. Envie uma foto em que apareça apenas você.", "multiple_faces");

  const pending = await pendingCount(event.id);
  if (!event.face_collection_id) return logged(event.id, pending > 0 ? { status: "processing", pending } : { status: "no_match", pending });

  let matches: FaceMatch[];
  if (cfg.FACE_PROVIDER === "mock") {
    // Simulado: "rostos" iguais = mesma cor (pessoa fictícia).
    const rows = await q<{ face_id: string }>("select face_id from mock_face_index where collection_id=$1 and persona=$2 limit $3", [
      event.face_collection_id,
      relevant[0].persona ?? -1,
      cfg.FACE_SEARCH_MAX_FACES,
    ]);
    matches = rows.map((r) => ({ faceId: r.face_id, similarity: 97 + (parseInt(r.face_id.slice(0, 2), 16) / 255) * 2.5 }));
  } else {
    matches = result.matches ?? [];
  }
  if (result.searched || cfg.FACE_PROVIDER === "mock") await countUsage(event.id, "search");

  // Só contam rostos registrados para ESTE evento, de mídias publicadas e prontas.
  const refs = new Map<string, FaceRef>();
  if (matches.length) {
    const rows = await q<{ face_id: string; media_id: string; frame_ms: number | null }>(
      `select fr.face_id, fr.media_id, fr.frame_ms from face_records fr join media m on m.id = fr.media_id
       where fr.event_id=$1 and fr.face_id in (select value from json_each($2)) and m.event_id=$1 and m.published = 1 and m.status='ready'`,
      [event.id, matches.map((m) => m.faceId)],
    );
    for (const r of rows) refs.set(r.face_id, { mediaId: r.media_id, frameMs: r.frame_ms });
  }
  const grouped = groupMatches(matches, refs, cfg.FACE_MATCH_THRESHOLD, cfg.FACE_MAX_RESULTS);
  if (!grouped.length) return logged(event.id, pending > 0 ? { status: "processing", pending } : { status: "no_match", pending });

  const ids = grouped.map((g) => g.mediaId);
  const media = await q<MediaRow>("select * from media where id in (select value from json_each($1))", [ids]);
  const byId = new Map(media.map((m) => [m.id, m]));
  const items: PublicMedia[] = [];
  for (const g of grouped) {
    const m = byId.get(g.mediaId);
    if (m) items.push({ ...(await toPublicMedia(m)), similarity: Math.round(g.similarity * 10) / 10 });
  }
  await grantMedia(session.id, ids);
  return logged(event.id, { status: "matches", items, pending });
}

async function logged<T extends SearchOutcome>(eventId: string, outcome: T): Promise<T> {
  await q("insert into search_logs(event_id, outcome, match_count) values ($1,$2,$3)", [eventId, outcome.status, outcome.status === "matches" ? outcome.items.length : 0]);
  return outcome;
}
