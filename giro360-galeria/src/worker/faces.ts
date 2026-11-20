import path from "node:path";
import fsp from "node:fs/promises";
import sharp from "sharp";
import { q, q1, tx } from "@/lib/db";
import { config } from "@/lib/config";
import { getEvent } from "@/lib/events";
import { isEligibleForIndex, type MediaRow } from "@/lib/media";
import { faceProvider, collectionIdFor } from "@/lib/faces";
import { frameTimestamps } from "@/lib/faces/grouping";
import { FaceProviderError } from "@/lib/faces/types";
import { downloadOriginal, extractFrame, withTempDir, PermanentError } from "./media";

/**
 * Indexa uma mídia na coleção do evento. Cada unidade (foto inteira ou quadro de vídeo) é registrada em ai_units
 * na mesma transação que grava as referências faciais: se o worker cair no meio, a retomada pula o que já foi
 * enviado à IA — o custo não se repete.
 */
export async function indexMediaFaces(mediaId: string) {
  const m = await q1<MediaRow>("select * from media where id=$1", [mediaId]);
  if (!m) return;
  const event = await getEvent(m.event_id);
  if (!isEligibleForIndex(event, m)) {
    await q("update media set face_status = case when face_status in ('queued','indexing') then 'off' else face_status end where id=$1", [m.id]);
    return;
  }
  const provider = faceProvider();
  let collection = event.face_collection_id;
  if (!collection) {
    collection = collectionIdFor(event.id);
    await provider.ensureCollection(collection);
    await q("update events set face_collection_id=$2 where id=$1 and face_collection_id is null", [event.id, collection]);
  } else {
    await provider.ensureCollection(collection);
  }
  await q("update media set face_status='indexing', updated_at=now() where id=$1", [m.id]);

  const done = new Set((await q<{ unit_key: string }>("select unit_key from ai_units where media_id=$1", [m.id])).map((r) => r.unit_key));

  await withTempDir(async (dir) => {
    const src = path.join(dir, "original");
    await downloadOriginal(m.storage_key, src);
    const cfg = config();
    const units: { key: string; atSec: number | null }[] =
      m.kind === "photo"
        ? [{ key: "image", atSec: null }]
        : frameTimestamps(Number(m.duration_sec ?? 0), cfg.VIDEO_FRAME_INTERVAL_SEC, cfg.VIDEO_MAX_FRAMES).map((t) => ({
            key: `frame:${Math.round(t * 1000)}`,
            atSec: t,
          }));

    for (const unit of units) {
      if (done.has(unit.key)) continue;
      // Revalida antes de cada envio: se a mídia foi despublicada ou a busca desligada, para de gastar.
      const still = await q1<MediaRow>("select * from media where id=$1", [m.id]);
      const ev = await getEvent(m.event_id);
      if (!still || !isEligibleForIndex(ev, still)) return;

      let image: Buffer;
      if (unit.atSec === null) {
        image = await sharp(src).rotate().resize(1920, 1920, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
      } else {
        const f = path.join(dir, `f-${unit.key.replace(":", "-")}.jpg`);
        await extractFrame(src, unit.atSec, f);
        image = await fsp.readFile(f);
        await fsp.rm(f, { force: true });
      }
      let faces;
      try {
        faces = await provider.indexFaces(collection!, image, m.id);
      } catch (err) {
        if (err instanceof FaceProviderError && !err.retryable) throw new PermanentError(err.message);
        throw err;
      }
      await tx(async (c) => {
        await c.query("insert into ai_units(media_id, unit_key, faces) values ($1,$2,$3) on conflict do nothing", [m.id, unit.key, faces.length]);
        await c.query("insert into ai_usage(event_id, kind, units, provider) values ($1,$2,1,$3)", [
          m.event_id,
          m.kind === "photo" ? "index_photo" : "index_video_frame",
          provider.name,
        ]);
        for (const f of faces) {
          await c.query(
            `insert into face_records(event_id, media_id, provider, face_id, frame_ms, confidence, bbox)
             values ($1,$2,$3,$4,$5,$6,$7) on conflict (event_id, face_id) do nothing`,
            [m.event_id, m.id, provider.name, f.faceId, unit.atSec === null ? null : Math.round(unit.atSec * 1000), f.confidence, JSON.stringify(f.bbox)],
          );
        }
      });
    }
  });

  const n = await q1<{ n: string }>("select count(*) as n from face_records where media_id=$1", [m.id]);
  const count = Number(n?.n ?? 0);
  await q(
    `update media set face_status=$2, face_count=$3, face_indexed_at=now(), face_error=null, updated_at=now()
     where id=$1 and face_status='indexing'`,
    [m.id, count > 0 ? "indexed" : "no_faces", count],
  );
}

export async function markIndexFailed(mediaId: string, message: string) {
  await q("update media set face_status='failed', face_error=$2, updated_at=now() where id=$1", [mediaId, message.slice(0, 500)]);
}
