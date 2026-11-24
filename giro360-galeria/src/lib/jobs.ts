import { config } from "./config";
import { batch, nowIso, q, q1, type Statement } from "./db";
import { enqueue, type JobMessage } from "./queue";
import { getEvent, purgeEventFaces } from "./events";
import { isEligibleForIndex, queueIndexing, type MediaRow } from "./media";
import { frameTimestamps } from "./faces/grouping";
import { processor } from "./processor";
import { ProcessorError } from "./processor-types";
import * as storage from "./storage";

/**
 * Orquestração das tarefas pesadas (consumidor da fila no Worker). O Container faz o processamento;
 * aqui gravamos os resultados no D1. Tudo é idempotente: a fila entrega "pelo menos uma vez".
 */

export const collectionIdFor = (eventId: string) => `${config().FACE_COLLECTION_PREFIX}-${eventId}`;
export const MAX_ATTEMPTS = 5;

export async function handleJob(msg: JobMessage) {
  switch (msg.type) {
    case "process_media":
      return processMediaJob(msg.payload.mediaId);
    case "index_faces":
      return indexFacesJob(msg.payload.mediaId);
    case "process_cover":
      return processCoverJob(msg.payload.eventId, msg.payload.sourceKey);
  }
}

/** Chamado quando a tarefa esgotou as tentativas ou teve erro permanente. */
export async function onJobFailed(msg: JobMessage, message: string) {
  const now = nowIso();
  if (msg.type === "process_media") {
    await q("update media set status='failed', error=$2, updated_at=$3 where id=$1 and status in ('received','processing')", [msg.payload.mediaId, message.slice(0, 500), now]);
  }
  if (msg.type === "index_faces") {
    await q("update media set face_status='failed', face_error=$2, updated_at=$3 where id=$1", [msg.payload.mediaId, message.slice(0, 500), now]);
  }
}

export function isPermanent(err: unknown) {
  return err instanceof ProcessorError && err.permanent;
}

/**
 * Processa uma mídia recebida: confere o conteúdo, elimina duplicata exata (mesmo SHA-256 no evento),
 * gera miniatura/prévia e marca como disponível. Cada arquivo fica disponível sozinho, sem esperar o lote.
 */
export async function processMediaJob(mediaId: string) {
  const m = await q1<MediaRow & { process_attempts: number }>("select * from media where id=$1", [mediaId]);
  if (!m || !["received", "processing"].includes(m.status)) return; // excluída ou já processada
  await q("update media set status='processing', process_attempts=process_attempts+1, updated_at=$2 where id=$1", [m.id, nowIso()]);
  const p = await processor();
  const r = await p.process({ mediaId: m.id, eventId: m.event_id, storageKey: m.storage_key, sizeBytes: Number(m.size_bytes), kind: m.kind, contentType: m.content_type });

  // Duplicata: entre arquivos de mesmo conteúdo no evento, o mais antigo fica; o mais novo é descartado.
  await q("update media set sha256=$2 where id=$1", [m.id, r.sha256]);
  const older = await q1<{ id: string }>(
    `select id from media where event_id=$1 and sha256=$2 and id<>$3 and status in ('received','processing','ready')
       and (created_at, id) < ($4, $3) order by created_at limit 1`,
    [m.event_id, r.sha256, m.id, m.created_at],
  );
  const now = nowIso();
  if (older) {
    await batch([
      { sql: "update media set status='duplicate', duplicate_of=$2, updated_at=$3 where id=$1", params: [m.id, older.id, now] },
      { sql: "insert into deletion_tasks(event_id, target, ref) values ($1,'object',$2)", params: [m.event_id, { key: m.storage_key }] },
      { sql: "insert into deletion_tasks(event_id, target, ref) values ($1,'prefix',$2)", params: [m.event_id, { prefix: storage.keys.derived(m.event_id, m.id, "") }] },
    ]);
    await p.release(m.id);
    return;
  }
  await q(
    `update media set status='ready', ready_at=$2, error=null, width=$3, height=$4, duration_sec=$5,
       thumb_key=$6, preview_key=$7, poster_key=$8, derived_bytes=$9, updated_at=$2 where id=$1`,
    [m.id, now, r.width, r.height, r.durationSec, r.thumbKey, r.previewKey, r.posterKey, r.derivedBytes],
  );
  const fresh = (await q1<MediaRow>("select * from media where id=$1", [m.id]))!;
  if (isEligibleForIndex(await getEvent(fresh.event_id), fresh)) await queueIndexing(fresh.id);
  else await p.release(m.id);
}

/**
 * Indexa uma mídia na coleção do evento, uma unidade por vez (foto inteira ou quadro de vídeo). Cada unidade
 * é gravada em ai_units junto com as referências faciais: retomar depois de uma falha pula o que já foi
 * enviado à IA — o custo não se repete.
 */
export async function indexFacesJob(mediaId: string) {
  const m = await q1<MediaRow>("select * from media where id=$1", [mediaId]);
  if (!m) return;
  const p = await processor();
  let event = await getEvent(m.event_id);
  if (!isEligibleForIndex(event, m)) {
    await q("update media set face_status = case when face_status in ('queued','indexing') then 'off' else face_status end where id=$1", [m.id]);
    await p.release(m.id);
    return;
  }
  const provider = config().FACE_PROVIDER;
  const collection = event.face_collection_id ?? collectionIdFor(event.id);
  let ensure = !event.face_collection_id;
  if (ensure) await q("update events set face_collection_id=$2 where id=$1 and face_collection_id is null", [event.id, collection]);
  await q("update media set face_status='indexing', updated_at=$2 where id=$1", [m.id, nowIso()]);

  const done = new Set((await q<{ unit_key: string }>("select unit_key from ai_units where media_id=$1", [m.id])).map((r) => r.unit_key));
  const cfg = config();
  const units =
    m.kind === "photo"
      ? [{ key: "image", atSec: null as number | null }]
      : frameTimestamps(Number(m.duration_sec ?? 0), cfg.VIDEO_FRAME_INTERVAL_SEC, cfg.VIDEO_MAX_FRAMES).map((t) => ({ key: `frame:${Math.round(t * 1000)}`, atSec: t as number | null }));

  for (const unit of units) {
    if (done.has(unit.key)) continue;
    // Revalida antes de cada envio: se a mídia foi despublicada ou a busca desligada, para de gastar.
    const still = await q1<MediaRow>("select * from media where id=$1", [m.id]);
    event = await getEvent(m.event_id);
    if (!still || !isEligibleForIndex(event, still)) return;
    const r = await p.indexUnit({ mediaId: m.id, storageKey: m.storage_key, sizeBytes: Number(m.size_bytes), atSec: unit.atSec, collectionId: collection, provider, ensureCollection: ensure });
    ensure = false;
    const stmts: Statement[] = [
      { sql: "insert into ai_units(media_id, unit_key, faces) values ($1,$2,$3) on conflict do nothing", params: [m.id, unit.key, r.faces.length] },
      { sql: "insert into ai_usage(event_id, kind, units, provider) values ($1,$2,1,$3)", params: [m.event_id, m.kind === "photo" ? "index_photo" : "index_video_frame", provider] },
    ];
    for (const f of r.faces) {
      stmts.push({
        sql: `insert into face_records(event_id, media_id, provider, face_id, frame_ms, confidence, bbox)
              values ($1,$2,$3,$4,$5,$6,$7) on conflict (event_id, face_id) do nothing`,
        params: [m.event_id, m.id, provider, f.faceId, unit.atSec === null ? null : Math.round(unit.atSec * 1000), f.confidence, f.bbox],
      });
      if (provider === "mock" && f.persona !== undefined) {
        stmts.push({ sql: "insert into mock_face_index(collection_id, face_id, persona, external_id) values ($1,$2,$3,$4) on conflict do nothing", params: [collection, f.faceId, f.persona, m.id] });
      }
    }
    await batch(stmts);
  }

  const n = await q1<{ n: number }>("select count(*) as n from face_records where media_id=$1", [m.id]);
  const count = Number(n?.n ?? 0);
  await q("update media set face_status=$2, face_count=$3, face_indexed_at=$4, face_error=null, updated_at=$4 where id=$1 and face_status='indexing'", [
    m.id,
    count > 0 ? "indexed" : "no_faces",
    count,
    nowIso(),
  ]);
  await p.release(m.id);
}

export async function processCoverJob(eventId: string, sourceKey: string) {
  const old = await q1<{ cover_key: string | null; cover_thumb_key: string | null }>("select cover_key, cover_thumb_key from events where id=$1", [eventId]);
  if (!old) return;
  const r = await (await processor()).cover({ eventId, sourceKey });
  const stmts: Statement[] = [{ sql: "update events set cover_key=$2, cover_thumb_key=$3, updated_at=$4 where id=$1", params: [eventId, r.coverKey, r.thumbKey, nowIso()] }];
  for (const k of [old.cover_key, old.cover_thumb_key]) {
    if (k) stmts.push({ sql: "insert into deletion_tasks(event_id, target, ref) values ($1,'object',$2)", params: [eventId, { key: k }] });
  }
  await batch(stmts);
}

// ------------------------------------------------------------------ manutenção (Cron Trigger)

type DeletionTask = { id: number; event_id: string | null; target: string; ref: string; attempts: number };

/** Executa exclusões pendentes no armazenamento e na IA. Falhas ficam registradas e são repetidas com espera crescente. */
export async function runDeletionTasks(limit = 25) {
  const tasks = await q<DeletionTask>("select id, event_id, target, ref, attempts from deletion_tasks where status='pending' and next_attempt_at <= $1 order by id limit $2", [nowIso(), limit]);
  const provider = config().FACE_PROVIDER;
  let ok = 0;
  for (const t of tasks) {
    const ref = JSON.parse(t.ref);
    try {
      switch (t.target) {
        case "object":
          await storage.deleteObject(ref.key);
          break;
        case "prefix":
          await storage.deletePrefix(ref.prefix);
          break;
        case "multipart":
          await storage.abortMultipart(ref.key, ref.uploadId);
          await storage.deleteObject(ref.key).catch(() => undefined);
          break;
        case "faces":
          if (provider === "mock") await q("delete from mock_face_index where collection_id=$1 and face_id in (select value from json_each($2))", [ref.collectionId, ref.faceIds]);
          else if (provider === "rekognition") await (await processor()).deleteFaces({ provider, collectionId: ref.collectionId, faceIds: ref.faceIds });
          break;
        case "collection":
          if (provider === "mock") await q("delete from mock_face_index where collection_id=$1", [ref.collectionId]);
          else if (provider === "rekognition") await (await processor()).deleteCollection({ provider, collectionId: ref.collectionId });
          break;
      }
      await q("update deletion_tasks set status='done', updated_at=$2, last_error=null where id=$1", [t.id, nowIso()]);
      ok++;
    } catch (err) {
      const delay = Math.min(6 * 3600, 30 * 2 ** Math.min(t.attempts, 12));
      await q("update deletion_tasks set attempts=attempts+1, last_error=$2, next_attempt_at=$3, updated_at=$4 where id=$1", [
        t.id,
        String((err as Error).message ?? err).slice(0, 500),
        new Date(Date.now() + delay * 1000).toISOString(),
        nowIso(),
      ]);
    }
  }
  return { processed: tasks.length, ok };
}

/** Apaga a biometria dos eventos cuja janela de busca facial (90 dias) terminou. */
export async function purgeExpiredFaceData() {
  const rows = await q<{ id: string }>(
    `select id from events where face_purged_at is null and face_until <= $1
       and (face_search_enabled = 1 or face_collection_id is not null or exists (select 1 from face_records fr where fr.event_id = events.id))`,
    [nowIso()],
  );
  for (const r of rows) await purgeEventFaces(r.id, "sistema:prazo-busca-facial");
  return rows.length;
}

/** Envios multipart abandonados há mais de 7 dias: aborta no armazenamento para não pagar por partes órfãs. */
export async function abortAbandonedUploads() {
  const cutoff = new Date(Date.now() - 7 * 86400_000).toISOString();
  const rows = await q<{ id: string; event_id: string; storage_key: string; upload_id: string }>(
    "select id, event_id, storage_key, upload_id from media where status='uploading' and upload_id is not null and updated_at < $1",
    [cutoff],
  );
  const now = nowIso();
  await batch(
    rows.flatMap((r) => [
      { sql: "insert into deletion_tasks(event_id, target, ref) values ($1,'multipart',$2)", params: [r.event_id, { key: r.storage_key, uploadId: r.upload_id }] },
      {
        sql: "update media set status='failed', error='Envio abandonado (mais de 7 dias sem conclusão). Selecione o arquivo de novo.', upload_id=null, updated_at=$2 where id=$1",
        params: [r.id, now],
      },
    ]),
  );
  return rows.length;
}

/** Rede de segurança: tarefas que ficaram paradas (mensagem perdida, container reiniciado) voltam para a fila. */
export async function requeueStuck() {
  const cutoff = new Date(Date.now() - 30 * 60_000).toISOString();
  const proc = await q<{ id: string; process_attempts: number }>(
    "select id, process_attempts from media where status in ('received','processing') and updated_at < $1 limit 50",
    [cutoff],
  );
  for (const r of proc) {
    if (r.process_attempts >= MAX_ATTEMPTS) {
      await onJobFailed({ type: "process_media", payload: { mediaId: r.id } }, "Processamento não concluiu após várias tentativas.");
    } else {
      await q("update media set updated_at=$2 where id=$1", [r.id, nowIso()]);
      await enqueue("process_media", { mediaId: r.id });
    }
  }
  const idx = await q<{ id: string }>("select id from media where face_status in ('queued','indexing') and updated_at < $1 limit 50", [cutoff]);
  for (const r of idx) await queueIndexing(r.id);
  return proc.length + idx.length;
}

export async function housekeeping() {
  const now = new Date();
  await q("delete from rate_limits where window_start < $1", [new Date(now.getTime() - 86400_000).toISOString()]);
  await q("delete from guest_sessions where expires_at < $1", [new Date(now.getTime() - 86400_000).toISOString()]);
  const facesPurged = await purgeExpiredFaceData();
  const deletions = await runDeletionTasks();
  const abandoned = await abortAbandonedUploads();
  const requeued = await requeueStuck();
  return { facesPurged, deletions, abandoned, requeued };
}
