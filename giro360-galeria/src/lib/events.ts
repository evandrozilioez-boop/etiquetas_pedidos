import crypto from "node:crypto";
import { z } from "zod";
import { config } from "./config";
import { q, q1 } from "./db";
import { HttpError } from "./http";
import { randomToken } from "./tokens";
import { audit } from "./audit";

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
  face_search_enabled: boolean;
  face_collection_id: string | null;
  retention_days: number;
  expires_at: Date;
  status: "active" | "closed";
  closed_at: Date | null;
  purge_status: "none" | "pending" | "done";
  purged_at: Date | null;
  created_at: Date;
};

export type EventPhase = "active" | "closed" | "expired";

export function eventPhase(e: Pick<EventRow, "status" | "expires_at" | "purge_status">, now = new Date()): EventPhase {
  if (e.purge_status !== "none" || new Date(e.expires_at).getTime() <= now.getTime()) return "expired";
  return e.status === "closed" ? "closed" : "active";
}

function eventCols(p = "") {
  return `${p}id, ${p}name, to_char(${p}event_date, 'YYYY-MM-DD') as event_date, ${p}city, ${p}description, ${p}cover_key,
  ${p}cover_thumb_key, ${p}public_token, ${p}is_private, ${p}access_code, ${p}allow_full_browse, ${p}face_search_enabled,
  ${p}face_collection_id, ${p}retention_days, ${p}expires_at, ${p}status, ${p}closed_at, ${p}purge_status, ${p}purged_at,
  ${p}created_at`;
}
const EVENT_COLS = eventCols();

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
  retentionDays: z.coerce.number().int().min(1).max(3650).optional(),
});
export type EventInput = z.input<typeof eventInput>;

export function normalizeCode(v: string) {
  return v.trim().toUpperCase().replace(/\s+/g, "");
}

/** Prazo = data do evento + dias de retenção (fim do dia, horário de Brasília). */
export function computeExpiry(eventDate: string, retentionDays: number): Date {
  const d = new Date(`${eventDate}T23:59:59-03:00`);
  d.setUTCDate(d.getUTCDate() + retentionDays);
  return d;
}

export function generateAccessCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(6);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export async function createEvent(raw: EventInput, adminId: string | null): Promise<EventRow> {
  const input = eventInput.parse(raw);
  const retention = input.retentionDays ?? config().DEFAULT_RETENTION_DAYS;
  if (input.isPrivate && !input.accessCode) input.accessCode = generateAccessCode();
  const row = await q1<EventRow>(
    `insert into events(name, event_date, city, description, public_token, is_private, access_code, allow_full_browse,
       retention_days, expires_at, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning ${EVENT_COLS}`,
    [
      input.name,
      input.eventDate,
      input.city,
      input.description ?? null,
      randomToken(12),
      input.isPrivate,
      input.accessCode,
      input.allowFullBrowse,
      retention,
      computeExpiry(input.eventDate, retention),
      adminId,
    ],
  );
  await audit(adminId ?? "sistema", "event.create", { eventId: row!.id });
  return row!;
}

export async function updateEvent(id: string, raw: EventInput, adminId: string): Promise<EventRow> {
  const input = eventInput.parse(raw);
  const current = await getEvent(id);
  if (eventPhase(current) === "expired" && current.purge_status !== "none") {
    throw new HttpError(409, "Este evento já expirou e seus arquivos foram removidos.");
  }
  const retention = input.retentionDays ?? current.retention_days;
  if (input.isPrivate && !input.accessCode) input.accessCode = current.access_code ?? generateAccessCode();
  const row = await q1<EventRow>(
    `update events set name=$2, event_date=$3, city=$4, description=$5, is_private=$6, access_code=$7,
       allow_full_browse=$8, retention_days=$9, expires_at=$10, updated_at=now()
     where id=$1 returning ${EVENT_COLS}`,
    [
      id,
      input.name,
      input.eventDate,
      input.city,
      input.description ?? null,
      input.isPrivate,
      input.accessCode,
      input.allowFullBrowse,
      retention,
      computeExpiry(input.eventDate, retention),
    ],
  );
  await audit(adminId, "event.update", { eventId: id });
  return row!;
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

export async function listEvents(): Promise<(EventRow & { phase: EventPhase; photos: number; videos: number; processing: number })[]> {
  const rows = await q<EventRow & { photos: string; videos: string; processing: string }>(
    `select ${eventCols("e.")},
       count(m.id) filter (where m.kind='photo' and m.status='ready') as photos,
       count(m.id) filter (where m.kind='video' and m.status='ready') as videos,
       count(m.id) filter (where m.status in ('uploading','received','processing') or m.face_status in ('queued','indexing')) as processing
     from events e left join media m on m.event_id = e.id
     group by e.id order by e.event_date desc, e.created_at desc`,
  );
  return rows.map((r) => ({
    ...r,
    phase: eventPhase(r),
    photos: Number(r.photos),
    videos: Number(r.videos),
    processing: Number(r.processing),
  }));
}

export async function setEventStatus(id: string, status: "active" | "closed", adminId: string) {
  await q(`update events set status=$2, closed_at = case when $2='closed' then now() else null end, updated_at=now() where id=$1`, [
    id,
    status,
  ]);
  await audit(adminId, status === "closed" ? "event.close" : "event.reopen", { eventId: id });
}

export async function rotateEventToken(id: string, adminId: string) {
  const token = randomToken(12);
  await q("update events set public_token=$2, updated_at=now() where id=$1", [id, token]);
  await q("delete from guest_sessions where event_id=$1", [id]);
  await audit(adminId, "event.rotate_link", { eventId: id });
  return token;
}

export function eventPublicUrl(e: Pick<EventRow, "public_token">) {
  return `${config().APP_URL}/e/${e.public_token}`;
}

export async function eventStats(eventId: string) {
  const s = await q1(
    `select
       count(*) filter (where kind='photo' and status='ready') as photos,
       count(*) filter (where kind='video' and status='ready') as videos,
       count(*) filter (where status in ('uploading')) as uploading,
       count(*) filter (where status in ('received','processing')) as processing,
       count(*) filter (where status='failed') as failed,
       count(*) filter (where status='duplicate') as duplicates,
       count(*) filter (where published = false) as unpublished,
       count(*) filter (where face_status='indexed') as face_indexed,
       count(*) filter (where face_status in ('queued','indexing')) as face_pending,
       count(*) filter (where consent_status='granted_all') as consent_granted,
       coalesce(sum(size_bytes) filter (where status in ('received','processing','ready')), 0) as original_bytes,
       coalesce(sum(derived_bytes), 0) as derived_bytes
     from media where event_id=$1`,
    [eventId],
  );
  const usage = await q<{ kind: string; units: string }>(
    "select kind, sum(units) as units from ai_usage where event_id=$1 group by kind",
    [eventId],
  );
  const searches = await q1<{ n: string }>("select count(*) as n from search_logs where event_id=$1", [eventId]);
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
    storageBytes: num("original_bytes") + num("derived_bytes"),
    originalBytes: num("original_bytes"),
    aiUsage: {
      indexPhoto: u.index_photo ?? 0,
      indexVideoFrame: u.index_video_frame ?? 0,
      search: u.search ?? 0,
      detectSelfie: u.detect_selfie ?? 0,
    },
    searches: Number(searches?.n ?? 0),
  };
}
