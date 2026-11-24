import { config } from "./config";
import { nowIso, plusSeconds, q, q1, uuid } from "./db";
import { HttpError, clientKey, getCookie, cookieHeader } from "./http";
import { signJwt, verifyJwt } from "./auth";
import { rateLimit, resetRateLimit } from "./rateLimit";
import { accessOpen, findEventByToken, normalizeCode, type EventRow } from "./events";
import { hmac, randomToken, safeEqual, isUuid } from "./tokens";
import { decodeCursor, encodeCursor, type MediaRow } from "./media";
import { audit } from "./audit";
import * as storage from "./storage";

/**
 * Controle de acesso do convidado.
 * - Evento privado: exige o código antes de buscar ou navegar.
 * - Cada sessão guarda as mídias liberadas pela busca (guest_grants); sem navegação completa,
 *   o convidado só vê essas mídias.
 * - Toda URL de arquivo é emitida aqui, após a autorização, com validade curta.
 */

const SESSION_TTL_SEC = 12 * 3600;
export const guestCookieName = (eventId: string) => `g360_e_${eventId.replace(/-/g, "")}`;

export type GuestSession = { id: string; event_id: string; code_verified: boolean };

export async function loadEvent(token: string): Promise<EventRow> {
  const event = await findEventByToken(token);
  if (!event) throw new HttpError(404, "Galeria não encontrada. Confira o link ou o QR Code.", "not_found");
  return event;
}

/** Bloqueio após o prazo: a galeria continua visível, mas busca/álbum/download não. */
export function requireAccessOpen(event: EventRow) {
  if (!accessOpen(event)) {
    throw new HttpError(403, "O prazo de download deste evento terminou. Peça a liberação para a equipe da Giro 360.", "access_closed");
  }
}

export async function sessionFromToken(jwt: string | undefined, event: EventRow): Promise<GuestSession | null> {
  const payload = await verifyJwt<{ sid: string; eid: string }>(jwt, "guest");
  if (!payload || payload.eid !== event.id || !isUuid(payload.sid)) return null;
  return q1<GuestSession>(
    "select id, event_id, code_verified from guest_sessions where id=$1 and event_id=$2 and expires_at > $3",
    [payload.sid, event.id, nowIso()],
  );
}

export async function getGuestSession(req: Request, event: EventRow) {
  return sessionFromToken(getCookie(req, guestCookieName(event.id)), event);
}

/** Abre (ou valida o código de) uma sessão. Limita tentativas de código por IP e evento. */
export async function openSession(req: Request, event: EventRow, code: string | undefined) {
  requireAccessOpen(event);
  let verified = !event.is_private;
  if (event.is_private) {
    const key = `code:${event.id}:${clientKey(req)}`;
    await rateLimit(key, 5, 15 * 60, "Muitas tentativas. Aguarde 15 minutos e tente de novo.");
    const expected = event.access_code ? normalizeCode(event.access_code) : "";
    if (!code || !expected || !safeEqual(normalizeCode(code), expected)) {
      throw new HttpError(401, "Código incorreto. Confira o código no estande ou no material do evento.", "bad_code");
    }
    await resetRateLimit(key);
    verified = true;
  }
  const existing = await getGuestSession(req, event);
  let id = existing?.id;
  if (existing) {
    if (verified && !existing.code_verified) await q("update guest_sessions set code_verified=1 where id=$1", [existing.id]);
  } else {
    id = uuid();
    await q("insert into guest_sessions(id, event_id, code_verified, expires_at) values ($1,$2,$3,$4)", [id, event.id, verified, plusSeconds(SESSION_TTL_SEC)]);
  }
  const jwt = await signJwt({ sid: id, eid: event.id }, SESSION_TTL_SEC, "guest");
  return { sessionId: id!, setCookie: cookieHeader(guestCookieName(event.id), jwt, SESSION_TTL_SEC) };
}

export async function requireGuest(req: Request, event: EventRow): Promise<GuestSession> {
  requireAccessOpen(event);
  const s = await getGuestSession(req, event);
  if (!s || (event.is_private && !s.code_verified)) {
    throw new HttpError(401, event.is_private ? "Digite o código do evento para continuar." : "Sessão expirada. Recarregue a página.", "need_code");
  }
  return s;
}

export async function grantMedia(sessionId: string, mediaIds: string[]) {
  if (!mediaIds.length) return;
  await q("insert into guest_grants(session_id, media_id) select $1, value from json_each($2) where true on conflict do nothing", [sessionId, mediaIds]);
}

async function isGranted(sessionId: string, mediaId: string) {
  return !!(await q1("select 1 as ok from guest_grants where session_id=$1 and media_id=$2", [sessionId, mediaId]));
}

export async function canSeeMedia(event: EventRow, session: GuestSession, mediaId: string) {
  return event.allow_full_browse || (await isGranted(session.id, mediaId));
}

const VISIBLE = "published = 1 and status='ready'";

export type PublicMedia = {
  id: string;
  kind: "photo" | "video";
  width: number | null;
  height: number | null;
  durationSec: number | null;
  sizeBytes: number;
  thumbUrl: string | null;
  previewUrl: string | null;
  posterUrl: string | null;
  similarity?: number;
};

export async function toPublicMedia(m: MediaRow): Promise<PublicMedia> {
  return {
    id: m.id,
    kind: m.kind,
    width: m.width,
    height: m.height,
    durationSec: m.duration_sec ? Number(m.duration_sec) : null,
    sizeBytes: Number(m.size_bytes),
    thumbUrl: m.thumb_key ? await storage.presignGet(m.thumb_key, { contentType: "image/webp" }) : null,
    previewUrl: m.preview_key ? await storage.presignGet(m.preview_key, { contentType: m.kind === "video" ? "video/mp4" : "image/webp" }) : null,
    posterUrl: m.poster_key ? await storage.presignGet(m.poster_key, { contentType: "image/webp" }) : null,
  };
}

/** Mídias que o convidado pode ver: álbum completo (se permitido) ou só as liberadas pela busca. */
export async function listGuestMedia(event: EventRow, session: GuestSession, opts: { cursor?: string | null; kind?: string | null }) {
  const limit = 30;
  const params: unknown[] = [event.id, limit + 1];
  let where = `event_id=$1 and ${VISIBLE}`;
  if (!event.allow_full_browse) {
    params.push(session.id);
    where += ` and id in (select media_id from guest_grants where session_id = $${params.length})`;
  }
  if (opts.kind === "photo" || opts.kind === "video") {
    params.push(opts.kind);
    where += ` and kind = $${params.length}`;
  }
  const cur = decodeCursor(opts.cursor ?? null);
  if (cur) {
    params.push(cur.at, cur.id);
    where += ` and (created_at, id) < ($${params.length - 1}, $${params.length})`;
  }
  const rows = await q<MediaRow>(`select * from media where ${where} order by created_at desc, id desc limit $2`, params);
  const page = rows.slice(0, limit);
  return {
    items: await Promise.all(page.map((m) => toPublicMedia(m))),
    nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null,
  };
}

export async function guestDownloadUrl(req: Request, event: EventRow, mediaId: string) {
  const session = await requireGuest(req, event);
  if (!isUuid(mediaId)) throw new HttpError(404, "Arquivo não encontrado.");
  const m = await q1<MediaRow>(`select * from media where id=$1 and event_id=$2 and ${VISIBLE}`, [mediaId, event.id]);
  if (!m || !(await canSeeMedia(event, session, m.id))) throw new HttpError(404, "Arquivo não encontrado.");
  return storage.presignGet(m.storage_key, { downloadName: downloadName(event, m), contentType: m.content_type });
}

export function downloadName(event: Pick<EventRow, "name">, m: Pick<MediaRow, "original_filename">) {
  const base = event.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `giro360-${base}-${m.original_filename}`;
}

// ---------- Destaques (portfólio): visíveis mesmo com o acesso bloqueado ----------

export async function listHighlights(eventId: string) {
  const rows = await q<MediaRow>(
    `select * from media where event_id=$1 and highlight = 1 and image_use = 1 and ${VISIBLE} order by created_at desc limit 60`,
    [eventId],
  );
  return Promise.all(rows.map((m) => toPublicMedia(m)));
}

// ---------- QR individual por captura ----------

export async function createShareLink(eventId: string, mediaId: string, adminId: string) {
  const m = await q1<MediaRow>("select * from media where id=$1 and event_id=$2", [mediaId, eventId]);
  if (!m) throw new HttpError(404, "Arquivo não encontrado.");
  if (!m.published) throw new HttpError(409, "Publique a mídia antes de gerar o QR individual.");
  const token = randomToken(16);
  const id = uuid();
  // O link segue o prazo do evento; a validade própria é só um teto de segurança (revogável a qualquer momento).
  await q(
    `insert into share_links(id, event_id, media_id, token_hash, token_hint, expires_at, created_by) values ($1,$2,$3,$4,$5,$6,$7)`,
    [id, eventId, mediaId, hmac(`share:${token}`), token.slice(0, 4), plusSeconds(3650 * 86400), adminId],
  );
  await audit(adminId, "share.create", { eventId, mediaId });
  return { id, token, url: `${config().APP_URL}/m/${token}` };
}

export async function revokeShareLink(eventId: string, linkId: string, adminId: string) {
  await q("update share_links set revoked_at=coalesce(revoked_at, $3) where id=$1 and event_id=$2", [linkId, eventId, nowIso()]);
  await audit(adminId, "share.revoke", { eventId, details: { linkId } });
}

export type ShareResolution = { state: "ok" | "processing" | "access_closed"; event: EventRow; media: MediaRow; linkId: string };

/** Resolve um token de QR individual. Funciona sem IA: depende só da mídia estar recebida e publicada. */
export async function resolveShareToken(token: string): Promise<ShareResolution | null> {
  if (!token || token.length < 16 || token.length > 64) return null;
  const link = await q1<{ id: string; event_id: string; media_id: string }>(
    "select id, event_id, media_id from share_links where token_hash=$1 and revoked_at is null and expires_at > $2",
    [hmac(`share:${token}`), nowIso()],
  );
  if (!link) return null;
  const media = await q1<MediaRow>("select * from media where id=$1 and published = 1", [link.media_id]);
  if (!media || media.status === "failed" || media.status === "duplicate" || media.status === "uploading") return null;
  const event = await q1<EventRow>("select * from events where id=$1", [link.event_id]);
  if (!event) return null;
  const state = !accessOpen(event) ? "access_closed" : media.status === "ready" ? "ok" : "processing";
  return { state, event, media, linkId: link.id };
}

export async function touchShareLink(linkId: string) {
  await q("update share_links set last_used_at=$2, use_count=use_count+1 where id=$1", [linkId, nowIso()]);
}
