import { randomUUID } from "node:crypto";
import { z } from "zod";
import { ACCEPTED_TYPES, config, type AcceptedType } from "./config";
import { q, q1, tx, type Tx } from "./db";
import { HttpError } from "./http";
import { enqueue } from "./queue";
import { eventPhase, getEvent } from "./events";
import { audit } from "./audit";
import * as storage from "./storage";

export type MediaRow = {
  id: string;
  event_id: string;
  kind: "photo" | "video";
  original_filename: string;
  content_type: string;
  size_bytes: string;
  client_fingerprint: string;
  sha256: string | null;
  storage_key: string;
  upload_mode: "single" | "multipart";
  upload_id: string | null;
  status: "uploading" | "received" | "processing" | "ready" | "failed" | "duplicate";
  error: string | null;
  duplicate_of: string | null;
  width: number | null;
  height: number | null;
  duration_sec: string | null;
  thumb_key: string | null;
  preview_key: string | null;
  poster_key: string | null;
  derived_bytes: string;
  published: boolean;
  consent_status: "pending" | "granted_all" | "denied";
  consent_note: string | null;
  face_status: "off" | "queued" | "indexing" | "indexed" | "no_faces" | "failed";
  face_count: number;
  face_error: string | null;
  capture_label: string | null;
  created_at: Date;
  ready_at: Date | null;
};

export async function getMedia(id: string): Promise<MediaRow> {
  const m = await q1<MediaRow>("select * from media where id=$1", [id]);
  if (!m) throw new HttpError(404, "Arquivo não encontrado.");
  return m;
}

export function partSizeBytes() {
  return config().MULTIPART_PART_MB * 1024 * 1024;
}

export function partCount(size: number, partSize = partSizeBytes()) {
  return Math.max(1, Math.ceil(size / partSize));
}

export const initUploadInput = z.object({
  filename: z.string().min(1).max(255),
  size: z.number().int().positive(),
  contentType: z.string(),
  fingerprint: z.string().min(16).max(200),
  captureLabel: z.string().max(120).optional().nullable(),
  consentGrantedAll: z.boolean().optional(),
});

export type UploadPlan =
  | { state: "already"; mediaId: string; status: MediaRow["status"]; duplicateOf: string | null }
  | { state: "single"; mediaId: string; url: string }
  | {
      state: "multipart";
      mediaId: string;
      partSize: number;
      totalParts: number;
      completedParts: { partNumber: number; size: number }[];
    };

/**
 * Inicia (ou retoma) o envio de um arquivo. A identidade do envio é a impressão digital calculada no navegador
 * (nome + tamanho + data + amostras do conteúdo). Repetir a chamada após uma queda de conexão devolve o mesmo
 * registro e as partes já confirmadas pelo armazenamento — nunca cria um segundo original.
 * Arquivos diferentes com o mesmo nome têm impressões digitais diferentes e são preservados.
 */
export async function initUpload(eventId: string, raw: z.input<typeof initUploadInput>, adminId: string): Promise<UploadPlan> {
  const input = initUploadInput.parse(raw);
  const event = await getEvent(eventId);
  if (eventPhase(event) !== "active") {
    throw new HttpError(409, "Este evento está encerrado ou expirado. Reabra-o para enviar arquivos.", "event_not_active");
  }
  const type = ACCEPTED_TYPES[input.contentType as AcceptedType];
  if (!type) throw new HttpError(415, `Formato não aceito (${input.contentType || "desconhecido"}). Use JPEG, PNG ou MP4.`, "bad_type");
  const maxMb = type.kind === "photo" ? config().UPLOAD_MAX_PHOTO_MB : config().UPLOAD_MAX_VIDEO_MB;
  if (input.size > maxMb * 1024 * 1024) {
    throw new HttpError(413, `Arquivo acima do limite de ${maxMb} MB para ${type.kind === "photo" ? "fotos" : "vídeos"}.`, "too_large");
  }

  let media = await q1<MediaRow>("select * from media where event_id=$1 and client_fingerprint=$2", [eventId, input.fingerprint]);
  if (!media) {
    const id = randomUUID();
    const mode = input.size > 2 * partSizeBytes() ? "multipart" : "single";
    const key = storage.keys.original(eventId, id, type.ext);
    const uploadId = mode === "multipart" ? await storage.createMultipart(key, input.contentType) : null;
    const consent = input.consentGrantedAll ? "granted_all" : "pending";
    media = await q1<MediaRow>(
      `insert into media(id, event_id, kind, original_filename, content_type, size_bytes, client_fingerprint, storage_key,
         upload_mode, upload_id, capture_label, consent_status, consent_set_by, consent_set_at, consent_note)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       on conflict (event_id, client_fingerprint) do nothing returning *`,
      [
        id,
        eventId,
        type.kind,
        input.filename,
        input.contentType,
        input.size,
        input.fingerprint,
        key,
        mode,
        uploadId,
        input.captureLabel ?? null,
        consent,
        input.consentGrantedAll ? adminId : null,
        input.consentGrantedAll ? new Date() : null,
        input.consentGrantedAll ? "Declarado pela produção no envio (autorização de todos os participantes)" : null,
      ],
    );
    if (!media) {
      // Corrida: outra aba iniciou o mesmo arquivo. Descarta o multipart criado e usa o registro existente.
      if (uploadId) await storage.abortMultipart(key, uploadId).catch(() => undefined);
      media = (await q1<MediaRow>("select * from media where event_id=$1 and client_fingerprint=$2", [eventId, input.fingerprint]))!;
    } else {
      await audit(adminId, "media.upload_start", { eventId, mediaId: media.id, details: { filename: input.filename, size: input.size } });
    }
  }

  if (["received", "processing", "ready", "duplicate"].includes(media.status)) {
    return { state: "already", mediaId: media.id, status: media.status, duplicateOf: media.duplicate_of };
  }
  if (media.status === "failed") {
    // Falhou depois do envio (no processamento)? O original já está no armazenamento: só reprocessa.
    const head = await storage.headObject(media.storage_key);
    if (head && head.size === Number(media.size_bytes)) {
      await markReceived(media.id);
      return { state: "already", mediaId: media.id, status: "received", duplicateOf: null };
    }
    await q("update media set status='uploading', error=null, updated_at=now() where id=$1", [media.id]);
  }
  return planFor(media);
}

async function planFor(media: MediaRow): Promise<UploadPlan> {
  if (media.upload_mode === "single") {
    return { state: "single", mediaId: media.id, url: await storage.presignPut(media.storage_key, media.content_type) };
  }
  let completed: { partNumber: number; etag: string; size: number }[] = [];
  if (media.upload_id) {
    try {
      completed = await storage.listParts(media.storage_key, media.upload_id);
    } catch (err) {
      if (!storage.isNoSuchUpload(err)) throw err;
      media.upload_id = null; // envio abortado/expirado no armazenamento: recomeça
    }
  }
  if (!media.upload_id) {
    const head = await storage.headObject(media.storage_key);
    if (head && head.size === Number(media.size_bytes)) {
      // Concluído no armazenamento, mas a confirmação não chegou ao servidor (queda de conexão).
      await markReceived(media.id);
      return { state: "already", mediaId: media.id, status: "received", duplicateOf: null };
    }
    const uploadId = await storage.createMultipart(media.storage_key, media.content_type);
    await q("update media set upload_id=$2, updated_at=now() where id=$1", [media.id, uploadId]);
    completed = [];
  }
  const size = Number(media.size_bytes);
  return {
    state: "multipart",
    mediaId: media.id,
    partSize: partSizeBytes(),
    totalParts: partCount(size),
    completedParts: completed.map((p) => ({ partNumber: p.partNumber, size: p.size })),
  };
}

async function requireUploading(mediaId: string, eventId: string) {
  const media = await getMedia(mediaId);
  if (media.event_id !== eventId) throw new HttpError(404, "Arquivo não encontrado.");
  return media;
}

export async function signParts(eventId: string, mediaId: string, partNumbers: number[]) {
  const media = await requireUploading(mediaId, eventId);
  if (media.upload_mode !== "multipart" || !media.upload_id || media.status !== "uploading") {
    throw new HttpError(409, "Este envio não está aguardando partes.", "not_uploading");
  }
  const total = partCount(Number(media.size_bytes));
  const urls: Record<number, string> = {};
  for (const n of partNumbers.slice(0, 50)) {
    if (!Number.isInteger(n) || n < 1 || n > total) throw new HttpError(400, "Número de parte inválido.");
    urls[n] = await storage.presignPart(media.storage_key, media.upload_id, n);
  }
  return urls;
}

/** Confirma o envio. Idempotente: chamar duas vezes não duplica nada. */
export async function completeUpload(eventId: string, mediaId: string) {
  const media = await requireUploading(mediaId, eventId);
  if (media.status !== "uploading") return { status: media.status };
  const size = Number(media.size_bytes);

  if (media.upload_mode === "multipart" && media.upload_id) {
    let parts: Awaited<ReturnType<typeof storage.listParts>> = [];
    try {
      parts = await storage.listParts(media.storage_key, media.upload_id);
    } catch (err) {
      if (!storage.isNoSuchUpload(err)) throw err;
    }
    if (parts.length) {
      const total = partCount(size);
      const sum = parts.reduce((a, p) => a + p.size, 0);
      if (parts.length !== total || sum !== size) {
        const missing = total - parts.length;
        throw new HttpError(409, `Ainda faltam ${missing} parte(s) deste arquivo.`, "parts_missing", {
          completedParts: parts.map((p) => ({ partNumber: p.partNumber, size: p.size })),
        });
      }
      await storage.completeMultipart(media.storage_key, media.upload_id, parts);
    }
  }
  const head = await storage.headObject(media.storage_key);
  if (!head) throw new HttpError(409, "O arquivo ainda não chegou ao armazenamento.", "not_in_storage");
  if (head.size !== size) {
    throw new HttpError(409, `Tamanho recebido (${head.size}) difere do esperado (${size}). Envie novamente.`, "size_mismatch");
  }
  await markReceived(media.id);
  return { status: "received" as const };
}

async function markReceived(mediaId: string) {
  await tx(async (c) => {
    await c.query(
      "update media set status='received', upload_id=null, error=null, updated_at=now() where id=$1 and status in ('uploading','failed')",
      [mediaId],
    );
    await enqueue("process_media", { mediaId }, { dedupeKey: `process:${mediaId}` }, c);
  });
}

/** Reenfileira apenas itens com falha (o original existe) — usado pelo botão "Tentar novamente". */
export async function retryFailed(eventId: string, mediaIds: string[] | "all", adminId: string) {
  const rows = await q<MediaRow>(
    `select * from media where event_id=$1 and (status='failed' or face_status='failed') ${mediaIds === "all" ? "" : "and id = any($2)"}`,
    mediaIds === "all" ? [eventId] : [eventId, mediaIds],
  );
  const result = { reprocessing: 0, needsReupload: 0, reindexing: 0 };
  for (const m of rows) {
    if (m.status === "failed") {
      const head = await storage.headObject(m.storage_key);
      if (head && head.size === Number(m.size_bytes)) {
        await markReceived(m.id);
        result.reprocessing++;
      } else {
        await q("update media set status='uploading', updated_at=now() where id=$1", [m.id]);
        result.needsReupload++;
      }
    } else if (m.face_status === "failed") {
      await queueIndexing(m.id);
      result.reindexing++;
    }
  }
  await audit(adminId, "media.retry", { eventId, details: result });
  return result;
}

export async function queueIndexing(mediaId: string, client: Tx | null = null) {
  const sql = "update media set face_status='queued', face_error=null, updated_at=now() where id=$1";
  if (client) await client.query(sql, [mediaId]);
  else await q(sql, [mediaId]);
  await enqueue("index_faces", { mediaId }, { dedupeKey: `index:${mediaId}`, maxAttempts: 4 }, client);
}

/** Retira referências faciais da mídia: do banco (efeito imediato na busca) e do provedor (tarefa com repetição). */
export async function removeFaces(c: Tx, mediaId: string, eventId: string) {
  const faces = await c.query<{ face_id: string }>("delete from face_records where media_id=$1 returning face_id", [mediaId]);
  await c.query("delete from ai_units where media_id=$1", [mediaId]);
  await c.query("update media set face_status='off', face_count=0, face_indexed_at=null, updated_at=now() where id=$1", [mediaId]);
  const ev = await c.query<{ face_collection_id: string | null }>("select face_collection_id from events where id=$1", [eventId]);
  const collection = ev.rows[0]?.face_collection_id;
  if (collection && faces.rows.length) {
    await c.query("insert into deletion_tasks(event_id, target, ref) values ($1,'faces',$2)", [
      eventId,
      JSON.stringify({ collectionId: collection, faceIds: faces.rows.map((f) => f.face_id) }),
    ]);
  }
}

export function isEligibleForIndex(
  e: { face_search_enabled: boolean },
  m: Pick<MediaRow, "published" | "status" | "consent_status">,
) {
  return e.face_search_enabled && m.published && m.status === "ready" && m.consent_status === "granted_all";
}

export async function setPublished(eventId: string, mediaIds: string[], published: boolean, adminId: string) {
  const event = await getEvent(eventId);
  await tx(async (c) => {
    for (const id of mediaIds) {
      const r = await c.query<MediaRow>(
        `update media set published=$3, unpublished_at = case when $3 then null else now() end, updated_at=now()
         where id=$1 and event_id=$2 returning *`,
        [id, eventId, published],
      );
      const m = r.rows[0];
      if (!m) continue;
      if (!published) {
        await removeFaces(c, id, eventId);
        await c.query("update share_links set revoked_at = coalesce(revoked_at, now()) where media_id=$1", [id]);
      } else if (isEligibleForIndex(event, m)) {
        await queueIndexing(id, c);
      }
    }
  });
  await audit(adminId, published ? "media.publish" : "media.unpublish", { eventId, details: { mediaIds } });
}

export async function setConsent(
  eventId: string,
  mediaIds: string[],
  status: MediaRow["consent_status"],
  note: string | null,
  consentIds: string[],
  adminId: string,
) {
  const event = await getEvent(eventId);
  if (status === "granted_all" && !note?.trim() && consentIds.length === 0) {
    throw new HttpError(400, "Descreva ou vincule as autorizações registradas antes de liberar a indexação.");
  }
  await tx(async (c) => {
    for (const id of mediaIds) {
      const r = await c.query<MediaRow>(
        `update media set consent_status=$3, consent_note=$4, consent_set_by=$5, consent_set_at=now(), updated_at=now()
         where id=$1 and event_id=$2 returning *`,
        [id, eventId, status, note, adminId],
      );
      const m = r.rows[0];
      if (!m) continue;
      for (const cid of consentIds) {
        await c.query(
          `insert into media_consents(media_id, consent_id)
           select $1, id from consent_records where id=$2 and event_id=$3 on conflict do nothing`,
          [id, cid, eventId],
        );
      }
      if (status !== "granted_all") await removeFaces(c, id, eventId);
      else if (isEligibleForIndex(event, m) && !["indexed", "no_faces", "queued", "indexing"].includes(m.face_status)) {
        await queueIndexing(id, c);
      }
    }
  });
  await audit(adminId, "media.consent", { eventId, details: { mediaIds, status, consentIds } });
}

/** Exclusão definitiva (ex.: pedido de remoção): original, derivados, referências faciais e links. */
export async function deleteMediaPermanently(eventId: string, mediaId: string, adminId: string) {
  await tx(async (c) => {
    const r = await c.query<MediaRow>("select * from media where id=$1 and event_id=$2 for update", [mediaId, eventId]);
    const m = r.rows[0];
    if (!m) throw new HttpError(404, "Arquivo não encontrado.");
    await removeFaces(c, mediaId, eventId);
    const ins = "insert into deletion_tasks(event_id, target, ref) values ($1,$2,$3)";
    if (m.upload_id) await c.query(ins, [eventId, "multipart", JSON.stringify({ key: m.storage_key, uploadId: m.upload_id })]);
    await c.query(ins, [eventId, "object", JSON.stringify({ key: m.storage_key })]);
    await c.query(ins, [eventId, "prefix", JSON.stringify({ prefix: storage.keys.derived(eventId, mediaId, "") })]);
    await c.query("update media set duplicate_of=null where duplicate_of=$1", [mediaId]);
    await c.query("delete from media where id=$1", [mediaId]);
  });
  await audit(adminId, "media.delete", { eventId, mediaId });
}

export type MediaListItem = {
  id: string;
  kind: "photo" | "video";
  filename: string;
  sizeBytes: number;
  status: MediaRow["status"];
  error: string | null;
  duplicateOf: string | null;
  published: boolean;
  consentStatus: MediaRow["consent_status"];
  faceStatus: MediaRow["face_status"];
  faceCount: number;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  captureLabel: string | null;
  createdAt: string;
  thumbUrl: string | null;
};

export async function toListItem(m: MediaRow): Promise<MediaListItem> {
  return {
    id: m.id,
    kind: m.kind,
    filename: m.original_filename,
    sizeBytes: Number(m.size_bytes),
    status: m.status,
    error: m.error,
    duplicateOf: m.duplicate_of,
    published: m.published,
    consentStatus: m.consent_status,
    faceStatus: m.face_status,
    faceCount: m.face_count,
    durationSec: m.duration_sec ? Number(m.duration_sec) : null,
    width: m.width,
    height: m.height,
    captureLabel: m.capture_label,
    createdAt: new Date(m.created_at).toISOString(),
    thumbUrl: m.thumb_key ? await storage.presignGet(m.thumb_key, { contentType: "image/webp" }) : null,
  };
}

/** Paginação por cursor (created_at, id) — estável mesmo com novos envios chegando durante o evento. */
export function encodeCursor(m: { created_at: Date; id: string }) {
  return Buffer.from(`${new Date(m.created_at).toISOString()}|${m.id}`).toString("base64url");
}
export function decodeCursor(c: string | null): { at: string; id: string } | null {
  if (!c) return null;
  try {
    const [at, id] = Buffer.from(c, "base64url").toString().split("|");
    if (!at || !id || Number.isNaN(Date.parse(at))) return null;
    return { at, id };
  } catch {
    return null;
  }
}

export async function listMediaAdmin(
  eventId: string,
  opts: { cursor?: string | null; limit?: number; filter?: string | null },
) {
  const limit = Math.min(100, opts.limit ?? 48);
  const cur = decodeCursor(opts.cursor ?? null);
  const params: unknown[] = [eventId, limit + 1];
  let where = "event_id=$1";
  if (cur) {
    params.push(cur.at, cur.id);
    where += ` and (created_at, id) < ($3::timestamptz, $4::uuid)`;
  }
  const f = opts.filter;
  if (f === "photo" || f === "video") where += ` and kind='${f}'`;
  if (f === "processing") where += " and status in ('uploading','received','processing')";
  if (f === "failed") where += " and (status='failed' or face_status='failed')";
  if (f === "unpublished") where += " and published=false";
  if (f === "consent_pending") where += " and consent_status='pending'";
  const rows = await q<MediaRow>(`select * from media where ${where} order by created_at desc, id desc limit $2`, params);
  const page = rows.slice(0, limit);
  return {
    items: await Promise.all(page.map(toListItem)),
    nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null,
  };
}
