import { z } from "zod";
import { ACCEPTED_TYPES, config, type AcceptedType } from "./config";
import { batch, nowIso, q, q1, uuid, type Statement } from "./db";
import { HttpError } from "./http";
import { enqueue } from "./queue";
import { faceOpen, getEvent, type EventRow } from "./events";
import { audit } from "./audit";
import * as storage from "./storage";

export type MediaRow = {
  id: string;
  event_id: string;
  kind: "photo" | "video";
  original_filename: string;
  content_type: string;
  size_bytes: number;
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
  duration_sec: number | null;
  thumb_key: string | null;
  preview_key: string | null;
  poster_key: string | null;
  derived_bytes: number;
  published: boolean;
  consent_status: "pending" | "granted_all" | "denied";
  consent_note: string | null;
  image_use: boolean;
  highlight: boolean;
  face_status: "off" | "queued" | "indexing" | "indexed" | "no_faces" | "failed";
  face_count: number;
  face_error: string | null;
  capture_label: string | null;
  created_at: string;
  ready_at: string | null;
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

const byFingerprint = (eventId: string, fp: string) =>
  q1<MediaRow>("select * from media where event_id=$1 and client_fingerprint=$2", [eventId, fp]);

/**
 * Inicia (ou retoma) o envio de um arquivo. A identidade do envio é a impressão digital calculada no navegador
 * (nome + tamanho + data + amostras do conteúdo). Repetir a chamada após uma queda de conexão devolve o mesmo
 * registro e as partes já confirmadas pelo armazenamento — nunca cria um segundo original.
 * Arquivos diferentes com o mesmo nome têm impressões digitais diferentes e são preservados.
 */
export async function initUpload(eventId: string, raw: z.input<typeof initUploadInput>, adminId: string): Promise<UploadPlan> {
  const input = initUploadInput.parse(raw);
  await getEvent(eventId);
  const type = ACCEPTED_TYPES[input.contentType as AcceptedType];
  if (!type) throw new HttpError(415, `Formato não aceito (${input.contentType || "desconhecido"}). Use JPEG, PNG, MP4 ou MOV.`, "bad_type");
  const maxMb = type.kind === "photo" ? config().UPLOAD_MAX_PHOTO_MB : config().UPLOAD_MAX_VIDEO_MB;
  if (input.size > maxMb * 1024 * 1024) {
    throw new HttpError(413, `Arquivo acima do limite de ${maxMb} MB para ${type.kind === "photo" ? "fotos" : "vídeos"}.`, "too_large");
  }

  let media = await byFingerprint(eventId, input.fingerprint);
  if (!media) {
    const id = uuid();
    const mode = input.size > 2 * partSizeBytes() ? "multipart" : "single";
    const key = storage.keys.original(eventId, id, type.ext);
    const uploadId = mode === "multipart" ? await storage.createMultipart(key, input.contentType) : null;
    const granted = !!input.consentGrantedAll;
    const inserted = await q1<{ id: string }>(
      `insert into media(id, event_id, kind, original_filename, content_type, size_bytes, client_fingerprint, storage_key,
         upload_mode, upload_id, capture_label, consent_status, consent_set_by, consent_set_at, consent_note)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       on conflict (event_id, client_fingerprint) do nothing returning id`,
      [
        id, eventId, type.kind, input.filename, input.contentType, input.size, input.fingerprint, key, mode, uploadId,
        input.captureLabel ?? null, granted ? "granted_all" : "pending", granted ? adminId : null, granted ? nowIso() : null,
        granted ? "Declarado pela produção no envio (autorização de todos os participantes)" : null,
      ],
    );
    if (!inserted) {
      // Corrida: outra aba iniciou o mesmo arquivo. Descarta o multipart criado e usa o registro existente.
      if (uploadId) await storage.abortMultipart(key, uploadId).catch(() => undefined);
    } else {
      await audit(adminId, "media.upload_start", { eventId, mediaId: id, details: { filename: input.filename, size: input.size } });
    }
    media = (await byFingerprint(eventId, input.fingerprint))!;
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
    await q("update media set status='uploading', error=null, updated_at=$2 where id=$1", [media.id, nowIso()]);
  }
  return planFor(media);
}

async function planFor(media: MediaRow): Promise<UploadPlan> {
  if (media.upload_mode === "single") {
    return { state: "single", mediaId: media.id, url: await storage.presignPut(media.storage_key, media.content_type) };
  }
  let completed: { partNumber: number; etag: string; size: number }[] = [];
  let uploadId = media.upload_id;
  if (uploadId) {
    try {
      completed = await storage.listParts(media.storage_key, uploadId);
    } catch (err) {
      if (!storage.isNoSuchUpload(err)) throw err;
      uploadId = null; // envio abortado/expirado no armazenamento: recomeça
    }
  }
  if (!uploadId) {
    const head = await storage.headObject(media.storage_key);
    if (head && head.size === Number(media.size_bytes)) {
      // Concluído no armazenamento, mas a confirmação não chegou ao servidor (queda de conexão).
      await markReceived(media.id);
      return { state: "already", mediaId: media.id, status: "received", duplicateOf: null };
    }
    uploadId = await storage.createMultipart(media.storage_key, media.content_type);
    await q("update media set upload_id=$2, updated_at=$3 where id=$1", [media.id, uploadId, nowIso()]);
    completed = [];
  }
  return {
    state: "multipart",
    mediaId: media.id,
    partSize: partSizeBytes(),
    totalParts: partCount(Number(media.size_bytes)),
    completedParts: completed.map((p) => ({ partNumber: p.partNumber, size: p.size })),
  };
}

async function mediaOfEvent(mediaId: string, eventId: string) {
  const media = await getMedia(mediaId);
  if (media.event_id !== eventId) throw new HttpError(404, "Arquivo não encontrado.");
  return media;
}

export async function signParts(eventId: string, mediaId: string, partNumbers: number[]) {
  const media = await mediaOfEvent(mediaId, eventId);
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
  const media = await mediaOfEvent(mediaId, eventId);
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
        throw new HttpError(409, `Ainda faltam ${total - parts.length} parte(s) deste arquivo.`, "parts_missing", {
          completedParts: parts.map((p) => ({ partNumber: p.partNumber, size: p.size })),
        });
      }
      await storage.completeMultipart(media.storage_key, media.upload_id, parts);
    }
  }
  const head = await storage.headObject(media.storage_key);
  if (!head) throw new HttpError(409, "O arquivo ainda não chegou ao armazenamento.", "not_in_storage");
  if (head.size !== size) throw new HttpError(409, `Tamanho recebido (${head.size}) difere do esperado (${size}). Envie novamente.`, "size_mismatch");
  await markReceived(media.id);
  return { status: "received" as const };
}

async function markReceived(mediaId: string) {
  await q(
    "update media set status='received', upload_id=null, error=null, process_attempts=0, updated_at=$2 where id=$1 and status in ('uploading','failed')",
    [mediaId, nowIso()],
  );
  await enqueue("process_media", { mediaId });
}

/** Reenfileira apenas itens com falha (o original existe) — usado pelo botão "Tentar novamente". */
export async function retryFailed(eventId: string, mediaIds: string[] | "all", adminId: string) {
  const rows = await q<MediaRow>(
    `select * from media where event_id=$1 and (status='failed' or face_status='failed') ${mediaIds === "all" ? "" : "and id in (select value from json_each($2))"}`,
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
        await q("update media set status='uploading', updated_at=$2 where id=$1", [m.id, nowIso()]);
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

export async function queueIndexing(mediaId: string) {
  await q("update media set face_status='queued', face_error=null, updated_at=$2 where id=$1", [mediaId, nowIso()]);
  await enqueue("index_faces", { mediaId });
}

/** Comandos que retiram as referências faciais de uma mídia: do banco (efeito imediato) e do provedor (tarefa com repetição). */
export async function removeFacesStatements(mediaId: string, eventId: string): Promise<Statement[]> {
  const faces = await q<{ face_id: string }>("select face_id from face_records where media_id=$1", [mediaId]);
  const ev = await q1<{ face_collection_id: string | null }>("select face_collection_id from events where id=$1", [eventId]);
  const stmts: Statement[] = [
    { sql: "delete from face_records where media_id=$1", params: [mediaId] },
    { sql: "delete from ai_units where media_id=$1", params: [mediaId] },
    { sql: "update media set face_status='off', face_count=0, face_indexed_at=null, updated_at=$2 where id=$1", params: [mediaId, nowIso()] },
  ];
  if (ev?.face_collection_id && faces.length) {
    stmts.push({
      sql: "insert into deletion_tasks(event_id, target, ref) values ($1,'faces',$2)",
      params: [eventId, { collectionId: ev.face_collection_id, faceIds: faces.map((f) => f.face_id) }],
    });
  }
  return stmts;
}

export function isEligibleForIndex(
  e: Pick<EventRow, "face_search_enabled" | "face_until" | "face_purged_at">,
  m: Pick<MediaRow, "published" | "status" | "consent_status">,
) {
  return faceOpen(e) && !!m.published && m.status === "ready" && m.consent_status === "granted_all";
}

const inEvent = (eventId: string, ids: string[]) =>
  q<MediaRow>("select * from media where event_id=$1 and id in (select value from json_each($2))", [eventId, ids]);

export async function setPublished(eventId: string, mediaIds: string[], published: boolean, adminId: string) {
  const event = await getEvent(eventId);
  const now = nowIso();
  const stmts: Statement[] = [];
  const toIndex: string[] = [];
  for (const m of await inEvent(eventId, mediaIds)) {
    stmts.push({ sql: "update media set published=$2, unpublished_at=$3, updated_at=$4 where id=$1", params: [m.id, published, published ? null : now, now] });
    if (!published) {
      stmts.push(...(await removeFacesStatements(m.id, eventId)));
      stmts.push({ sql: "update share_links set revoked_at = coalesce(revoked_at, $2) where media_id=$1", params: [m.id, now] });
      stmts.push({ sql: "update media set highlight=0 where id=$1", params: [m.id] });
    } else if (isEligibleForIndex(event, { ...m, published: true })) {
      toIndex.push(m.id);
    }
  }
  await batch(stmts);
  for (const id of toIndex) await queueIndexing(id);
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
  const now = nowIso();
  const stmts: Statement[] = [];
  const toIndex: string[] = [];
  for (const m of await inEvent(eventId, mediaIds)) {
    stmts.push({
      sql: "update media set consent_status=$2, consent_note=$3, consent_set_by=$4, consent_set_at=$5, updated_at=$5 where id=$1",
      params: [m.id, status, note, adminId, now],
    });
    for (const cid of consentIds) {
      stmts.push({
        sql: "insert into media_consents(media_id, consent_id) select $1, id from consent_records where id=$2 and event_id=$3 on conflict do nothing",
        params: [m.id, cid, eventId],
      });
    }
    if (status !== "granted_all") stmts.push(...(await removeFacesStatements(m.id, eventId)));
    else if (isEligibleForIndex(event, { ...m, consent_status: "granted_all" }) && !["indexed", "no_faces", "queued", "indexing"].includes(m.face_status)) {
      toIndex.push(m.id);
    }
  }
  await batch(stmts);
  for (const id of toIndex) await queueIndexing(id);
  await audit(adminId, "media.consent", { eventId, details: { mediaIds, status, consentIds } });
}

/** Autorização de uso de imagem para divulgação (portfólio). Revogar retira o destaque. */
export async function setImageUse(eventId: string, mediaIds: string[], granted: boolean, note: string | null, adminId: string) {
  if (granted && !note?.trim()) throw new HttpError(400, "Descreva a autorização de uso de imagem registrada.");
  await q(
    `update media set image_use=$3, image_use_note=$4, image_use_set_by=$5, image_use_set_at=$6,
       highlight = case when $3 = 1 then highlight else 0 end, updated_at=$6
     where event_id=$1 and id in (select value from json_each($2))`,
    [eventId, mediaIds, granted, granted ? note : null, adminId, nowIso()],
  );
  await audit(adminId, granted ? "media.image_use_grant" : "media.image_use_revoke", { eventId, details: { mediaIds } });
}

export async function setHighlight(eventId: string, mediaIds: string[], highlight: boolean, adminId: string) {
  if (highlight) {
    const blocked = await q1<{ n: number }>(
      `select count(*) as n from media where event_id=$1 and id in (select value from json_each($2))
         and (image_use = 0 or published = 0 or status <> 'ready')`,
      [eventId, mediaIds],
    );
    if (Number(blocked?.n) > 0) {
      throw new HttpError(409, "Só é possível destacar mídias publicadas, prontas e com autorização de uso de imagem.", "no_image_use");
    }
  }
  await q("update media set highlight=$3, updated_at=$4 where event_id=$1 and id in (select value from json_each($2))", [eventId, mediaIds, highlight, nowIso()]);
  await audit(adminId, highlight ? "media.highlight" : "media.unhighlight", { eventId, details: { mediaIds } });
}

/** Exclusão definitiva (ex.: pedido de remoção): original, derivados, referências faciais e links. */
export async function deleteMediaPermanently(eventId: string, mediaId: string, adminId: string) {
  const m = await q1<MediaRow>("select * from media where id=$1 and event_id=$2", [mediaId, eventId]);
  if (!m) throw new HttpError(404, "Arquivo não encontrado.");
  const ins = "insert into deletion_tasks(event_id, target, ref) values ($1,$2,$3)";
  const stmts: Statement[] = [...(await removeFacesStatements(mediaId, eventId))];
  if (m.upload_id) stmts.push({ sql: ins, params: [eventId, "multipart", { key: m.storage_key, uploadId: m.upload_id }] });
  stmts.push({ sql: ins, params: [eventId, "object", { key: m.storage_key }] });
  stmts.push({ sql: ins, params: [eventId, "prefix", { prefix: storage.keys.derived(eventId, mediaId, "") }] });
  stmts.push({ sql: "update media set duplicate_of=null where duplicate_of=$1", params: [mediaId] });
  stmts.push({ sql: "delete from media where id=$1", params: [mediaId] });
  await batch(stmts);
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
  imageUse: boolean;
  highlight: boolean;
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
    published: !!m.published,
    consentStatus: m.consent_status,
    imageUse: !!m.image_use,
    highlight: !!m.highlight,
    faceStatus: m.face_status,
    faceCount: m.face_count,
    durationSec: m.duration_sec ? Number(m.duration_sec) : null,
    width: m.width,
    height: m.height,
    captureLabel: m.capture_label,
    createdAt: m.created_at,
    thumbUrl: m.thumb_key ? await storage.presignGet(m.thumb_key, { contentType: "image/webp" }) : null,
  };
}

/** Paginação por cursor (created_at, id) — estável mesmo com novos envios chegando durante o evento. */
export function encodeCursor(m: { created_at: string; id: string }) {
  return btoa(`${m.created_at}|${m.id}`).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function decodeCursor(c: string | null): { at: string; id: string } | null {
  if (!c) return null;
  try {
    const [at, id] = atob(c.replace(/-/g, "+").replace(/_/g, "/")).split("|");
    if (!at || !id || Number.isNaN(Date.parse(at))) return null;
    return { at, id };
  } catch {
    return null;
  }
}

export async function listMediaAdmin(eventId: string, opts: { cursor?: string | null; limit?: number; filter?: string | null; ids?: string[] }) {
  const limit = Math.min(100, opts.limit ?? 48);
  const cur = decodeCursor(opts.cursor ?? null);
  const params: unknown[] = [eventId, limit + 1];
  let where = "event_id=$1";
  if (cur) {
    params.push(cur.at, cur.id);
    where += ` and (created_at, id) < ($3, $4)`;
  }
  const f = opts.filter;
  if (f === "photo" || f === "video") where += ` and kind='${f}'`;
  if (f === "processing") where += " and status in ('uploading','received','processing')";
  if (f === "failed") where += " and (status='failed' or face_status='failed')";
  if (f === "unpublished") where += " and published=0";
  if (f === "consent_pending") where += " and consent_status='pending'";
  if (f === "highlight") where += " and highlight=1";
  if (opts.ids) {
    params.push(opts.ids);
    where += ` and id in (select value from json_each($${params.length}))`;
  }
  const rows = await q<MediaRow>(`select * from media where ${where} order by created_at desc, id desc limit $2`, params);
  const page = rows.slice(0, limit);
  return {
    items: await Promise.all(page.map(toListItem)),
    nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null,
  };
}
