import { z } from "zod";
import { config } from "./config";
import { batch, nowIso, q, q1, uuid, type Statement } from "./db";
import { HttpError } from "./http";
import { randomToken } from "./tokens";
import { audit } from "./audit";
import { keys } from "./storage-keys";

export type EventRow = {
  id: string;
  name: string;
  event_date: string;
  city: string;
  description: string | null;
  cover_key: string | null;
  cover_thumb_key: string | null;
  public_token: string;
  is_private: boolean;
  access_code: string | null;
  allow_full_browse: boolean;
  access_until: string;
  face_search_enabled: boolean;
  face_until: string;
  face_collection_id: string | null;
  face_purged_at: string | null;
  show_in_portfolio: boolean;
  created_at: string;
};

/**
 * Regras de prazo (docs/decisoes.md):
 * - a galeria (capa, nome, destaques) nunca sai do ar;
 * - o acesso dos convidados (busca, álbum, download, QR individual) vale até access_until;
 * - a busca facial vale até face_until (N dias após o evento) e depois o índice é apagado.
 */
export function accessOpen(e: Pick<EventRow, "access_until">, now = new Date()) {
  return new Date(e.access_until).getTime() > now.getTime();
}

export function faceOpen(e: Pick<EventRow, "face_search_enabled" | "face_until" | "face_purged_at">, now = new Date()) {
  return !!e.face_search_enabled && !e.face_purged_at && new Date(e.face_until).getTime() > now.getTime();
}

/** Fim do dia (horário de Brasília) da data do evento + N dias. */
export function endOfDayPlus(eventDate: string, days: number): Date {
  const d = new Date(`${eventDate}T23:59:59-03:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Nova data após "Liberar por mais N dias": conta do fim do prazo atual ou de agora, o que for mais tarde. */
export function extendedAccess(current: Date | string, days: number, now = new Date()): Date {
  const base = new Date(Math.max(new Date(current).getTime(), now.getTime()));
  return new Date(base.getTime() + days * 86400_000);
}

const EVENT_COLS = `id, name, event_date, city, description, cover_key, cover_thumb_key, public_token, is_private, access_code,
  allow_full_browse, access_until, face_search_enabled, face_until, face_collection_id, face_purged_at, show_in_portfolio, created_at`;

export function normalizeCode(v: string) {
  return v.trim().toUpperCase().replace(/\s+/g, "");
}

export const eventInput = z.object({
  name: z.string().trim().min(2, "Informe o nome do evento").max(140),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  city: z.string().trim().min(2, "Informe a cidade").max(80),
  description: z.string().trim().max(500).optional().nullable(),
  isPrivate: z.boolean().default(true),
  accessCode: z
    .string()
    .trim()
    .max(32)
    .optional()
    .nullable()
    .transform((v) => (v ? normalizeCode(v) : null)),
  allowFullBrowse: z.boolean().default(false),
  showInPortfolio: z.boolean().default(false),
});
export type EventInput = z.input<typeof eventInput>;

export function generateAccessCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => alphabet[b % alphabet.length]).join("");
}

export async function createEvent(raw: EventInput, adminId: string | null): Promise<EventRow> {
  const input = eventInput.parse(raw);
  if (input.isPrivate && !input.accessCode) input.accessCode = generateAccessCode();
  const c = config();
  const id = uuid();
  await q(
    `insert into events(id, name, event_date, city, description, public_token, is_private, access_code, allow_full_browse,
       show_in_portfolio, access_until, face_until, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      id,
      input.name,
      input.eventDate,
      input.city,
      input.description ?? null,
      randomToken(12),
      input.isPrivate,
      input.accessCode,
      input.allowFullBrowse,
      input.showInPortfolio,
      endOfDayPlus(input.eventDate, c.ACCESS_DAYS),
      endOfDayPlus(input.eventDate, c.FACE_DAYS),
      adminId,
    ],
  );
  await audit(adminId ?? "sistema", "event.create", { eventId: id });
  return getEvent(id);
}

export async function updateEvent(id: string, raw: EventInput, adminId: string): Promise<EventRow> {
  const input = eventInput.parse(raw);
  const current = await getEvent(id);
  if (input.isPrivate && !input.accessCode) input.accessCode = current.access_code ?? generateAccessCode();
  const c = config();
  // Mudar a data recalcula os prazos padrão, sem encurtar uma liberação já concedida.
  const dateChanged = input.eventDate !== current.event_date;
  const accessUntil = dateChanged
    ? new Date(Math.max(endOfDayPlus(input.eventDate, c.ACCESS_DAYS).getTime(), new Date(current.access_until).getTime()))
    : current.access_until;
  const faceUntil = dateChanged ? endOfDayPlus(input.eventDate, c.FACE_DAYS) : current.face_until;
  await q(
    `update events set name=$2, event_date=$3, city=$4, description=$5, is_private=$6, access_code=$7,
       allow_full_browse=$8, show_in_portfolio=$9, access_until=$10, face_until=$11, updated_at=$12
     where id=$1`,
    [id, input.name, input.eventDate, input.city, input.description ?? null, input.isPrivate, input.accessCode,
      input.allowFullBrowse, input.showInPortfolio, accessUntil, faceUntil, nowIso()],
  );
  await audit(adminId, "event.update", { eventId: id });
  return getEvent(id);
}

export async function getEvent(id: string): Promise<EventRow> {
  const row = await q1<EventRow>(`select ${EVENT_COLS} from events where id = $1`, [id]);
  if (!row) throw new HttpError(404, "Evento não encontrado.");
  return row;
}

export async function findEventByToken(token: string): Promise<EventRow | null> {
  if (!token || token.length > 64) return null;
  return q1<EventRow>(`select ${EVENT_COLS} from events where public_token = $1`, [token]);
}

export type EventListItem = EventRow & { photos: number; videos: number; processing: number; highlights: number };

export async function listEvents(): Promise<EventListItem[]> {
  return q<EventListItem>(
    `select ${EVENT_COLS.split(",").map((c) => "e." + c.trim()).join(", ")},
       count(m.id) filter (where m.kind='photo' and m.status='ready') as photos,
       count(m.id) filter (where m.kind='video' and m.status='ready') as videos,
       count(m.id) filter (where m.status in ('uploading','received','processing') or m.face_status in ('queued','indexing')) as processing,
       count(m.id) filter (where m.highlight = 1 and m.image_use = 1 and m.published = 1 and m.status='ready') as highlights
     from events e left join media m on m.event_id = e.id
     group by e.id order by e.event_date desc, e.created_at desc`,
  );
}

export async function extendAccess(id: string, adminId: string): Promise<EventRow> {
  const e = await getEvent(id);
  const until = extendedAccess(e.access_until, config().ACCESS_EXTENSION_DAYS);
  await q(`update events set access_until=$2, updated_at=$3 where id=$1`, [id, until, nowIso()]);
  await audit(adminId, "event.access_extend", { eventId: id, details: { until } });
  return getEvent(id);
}

export async function blockAccessNow(id: string, adminId: string): Promise<EventRow> {
  await getEvent(id);
  await q(`update events set access_until=$2, updated_at=$2 where id=$1`, [id, nowIso()]);
  await audit(adminId, "event.access_block", { eventId: id });
  return getEvent(id);
}

export async function rotateEventToken(id: string, adminId: string) {
  const token = randomToken(12);
  await batch([
    { sql: "update events set public_token=$2, updated_at=$3 where id=$1", params: [id, token, nowIso()] },
    { sql: "delete from guest_sessions where event_id=$1", params: [id] },
  ]);
  await audit(adminId, "event.rotate_link", { eventId: id });
  return token;
}

export function eventPublicUrl(e: Pick<EventRow, "public_token">) {
  return `${config().APP_URL}/e/${e.public_token}`;
}

/**
 * Apaga os dados biométricos do evento (coleção no provedor + referências locais) e desliga a busca.
 * Usado pelo botão do painel e automaticamente quando face_until passa.
 */
export async function purgeEventFaces(eventId: string, actor: string) {
  const e = await q1<{ face_collection_id: string | null }>("select face_collection_id from events where id=$1", [eventId]);
  const now = nowIso();
  const stmts: Statement[] = [
    { sql: "delete from face_records where event_id=$1", params: [eventId] },
    { sql: "delete from ai_units where media_id in (select id from media where event_id=$1)", params: [eventId] },
    { sql: "update media set face_status='off', face_count=0, face_indexed_at=null, updated_at=$2 where event_id=$1", params: [eventId, now] },
    {
      sql: "update events set face_search_enabled=0, face_collection_id=null, face_purged_at=$2, updated_at=$2 where id=$1",
      params: [eventId, now],
    },
  ];
  if (e?.face_collection_id) {
    stmts.push({ sql: "insert into deletion_tasks(event_id, target, ref) values ($1,'collection',$2)", params: [eventId, { collectionId: e.face_collection_id }] });
  }
  await batch(stmts);
  await audit(actor, "event.face_purge", { eventId });
}

/** Exclui o evento inteiro: originais, derivados, biometria, links e registros. */
export async function deleteEvent(eventId: string, adminId: string) {
  await purgeEventFaces(eventId, adminId);
  const pending = await q<{ storage_key: string; upload_id: string }>(
    "select storage_key, upload_id from media where event_id=$1 and upload_id is not null",
    [eventId],
  );
  await batch([
    ...pending.map((m) => ({
      sql: "insert into deletion_tasks(event_id, target, ref) values ($1,'multipart',$2)",
      params: [eventId, { key: m.storage_key, uploadId: m.upload_id }],
    })),
    { sql: "insert into deletion_tasks(event_id, target, ref) values ($1,'prefix',$2)", params: [eventId, { prefix: keys.eventPrefix(eventId) }] },
    { sql: "delete from events where id=$1", params: [eventId] },
  ]);
  await audit(adminId, "event.delete", { eventId });
}

export async function eventStats(eventId: string) {
  const s = await q1<Record<string, number>>(
    `select
       count(*) filter (where kind='photo' and status='ready') as photos,
       count(*) filter (where kind='video' and status='ready') as videos,
       count(*) filter (where status='uploading') as uploading,
       count(*) filter (where status in ('received','processing')) as processing,
       count(*) filter (where status='failed') as failed,
       count(*) filter (where status='duplicate') as duplicates,
       count(*) filter (where published = 0) as unpublished,
       count(*) filter (where face_status='indexed') as face_indexed,
       count(*) filter (where face_status in ('queued','indexing')) as face_pending,
       count(*) filter (where consent_status='granted_all') as consent_granted,
       count(*) filter (where highlight = 1 and image_use = 1) as highlights,
       coalesce(sum(size_bytes) filter (where status in ('received','processing','ready')), 0) as original_bytes,
       coalesce(sum(derived_bytes), 0) as derived_bytes
     from media where event_id=$1`,
    [eventId],
  );
  const usage = await q<{ kind: string; units: number }>("select kind, sum(units) as units from ai_usage where event_id=$1 group by kind", [eventId]);
  const searches = await q1<{ n: number }>("select count(*) as n from search_logs where event_id=$1", [eventId]);
  const u = Object.fromEntries(usage.map((r) => [r.kind, Number(r.units)]));
  const num = (k: string) => Number(s?.[k] ?? 0);
  return {
    photos: num("photos"),
    videos: num("videos"),
    uploading: num("uploading"),
    processing: num("processing"),
    failed: num("failed"),
    duplicates: num("duplicates"),
    unpublished: num("unpublished"),
    faceIndexed: num("face_indexed"),
    facePending: num("face_pending"),
    consentGranted: num("consent_granted"),
    highlights: num("highlights"),
    storageBytes: num("original_bytes") + num("derived_bytes"),
    aiUsage: {
      indexPhoto: u.index_photo ?? 0,
      indexVideoFrame: u.index_video_frame ?? 0,
      search: u.search ?? 0,
      detectSelfie: u.detect_selfie ?? 0,
    },
    searches: Number(searches?.n ?? 0),
  };
}
