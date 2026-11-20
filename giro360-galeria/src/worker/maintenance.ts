import { q, q1 } from "@/lib/db";
import * as storage from "@/lib/storage";
import { faceProvider } from "@/lib/faces";
import { purgeEventFaces } from "@/lib/events";
import { requeueStale } from "@/lib/queue";

type DeletionTask = { id: number; event_id: string | null; target: string; ref: any; attempts: number };

/** Executa exclusões pendentes no armazenamento e na IA. Falhas ficam registradas e são repetidas com espera crescente. */
export async function runDeletionTasks(limit = 20) {
  const tasks = await q<DeletionTask>(
    `select id, event_id, target, ref, attempts from deletion_tasks
     where status='pending' and next_attempt_at <= now() order by id limit $1`,
    [limit],
  );
  let ok = 0;
  for (const t of tasks) {
    try {
      switch (t.target) {
        case "object":
          await storage.deleteObject(t.ref.key);
          break;
        case "prefix":
          await storage.deletePrefix(t.ref.prefix);
          break;
        case "multipart":
          await storage.abortMultipart(t.ref.key, t.ref.uploadId);
          await storage.deleteObject(t.ref.key).catch(() => undefined);
          break;
        case "faces":
          await faceProvider().deleteFaces(t.ref.collectionId, t.ref.faceIds);
          break;
        case "collection":
          await faceProvider().deleteCollection(t.ref.collectionId);
          break;
      }
      await q("update deletion_tasks set status='done', updated_at=now(), last_error=null where id=$1", [t.id]);
      ok++;
    } catch (err) {
      const delay = Math.min(6 * 3600, 30 * 2 ** Math.min(t.attempts, 12));
      await q(
        `update deletion_tasks set attempts=attempts+1, last_error=$2, next_attempt_at=now() + make_interval(secs => $3), updated_at=now()
         where id=$1`,
        [t.id, String((err as Error).message ?? err).slice(0, 500), delay],
      );
    }
  }
  return { processed: tasks.length, ok };
}

/** Apaga a biometria dos eventos cuja janela de busca facial (90 dias) terminou. */
export async function purgeExpiredFaceData() {
  const rows = await q<{ id: string }>(
    `select id from events where face_purged_at is null and face_until <= now()
       and (face_search_enabled or face_collection_id is not null
            or exists (select 1 from face_records fr where fr.event_id = events.id))`,
  );
  for (const r of rows) await purgeEventFaces(r.id, "sistema:prazo-busca-facial");
  return rows.length;
}

/** Envios multipart abandonados há mais de 7 dias: aborta no armazenamento para não pagar por partes órfãs. */
export async function abortAbandonedUploads() {
  const rows = await q<{ id: string; event_id: string; storage_key: string; upload_id: string }>(
    `with old as (
       select id, upload_id from media
       where status='uploading' and upload_id is not null and updated_at < now() - interval '7 days'
       for update
     )
     update media m set status='failed', error='Envio abandonado (mais de 7 dias sem conclusão). Selecione o arquivo de novo.',
       upload_id=null, updated_at=now()
     from old where m.id = old.id
     returning m.id, m.event_id, m.storage_key, old.upload_id`,
  );
  for (const r of rows) {
    if (r.upload_id) {
      await q("insert into deletion_tasks(event_id, target, ref) values ($1,'multipart',$2)", [
        r.event_id,
        JSON.stringify({ key: r.storage_key, uploadId: r.upload_id }),
      ]);
    }
  }
  return rows.length;
}

export async function housekeeping() {
  await requeueStale(30);
  await q("delete from rate_limits where window_start < now() - interval '1 day'");
  await q("delete from guest_sessions where expires_at < now() - interval '1 day'");
  await q("delete from jobs where status='done' and updated_at < now() - interval '14 days'");
  const faces = await purgeExpiredFaceData();
  const del = await runDeletionTasks();
  return { facesPurged: faces, deletions: del };
}

export async function pendingDeletions() {
  return q1<{ n: string }>("select count(*) as n from deletion_tasks where status='pending'");
}
