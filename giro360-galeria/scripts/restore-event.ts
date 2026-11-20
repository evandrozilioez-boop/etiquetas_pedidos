import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { tx, closePool } from "@/lib/db";
import { headObject, putObject } from "@/lib/storage";
import { enqueue } from "@/lib/queue";

/**
 * Restaura um evento salvo por backup:event (mesmos ids, links e QRs continuam válidos).
 * Registros já existentes são mantidos. A busca facial volta desligada; ao religar no painel,
 * as mídias autorizadas são indexadas de novo (isso gera custo de IA).
 * Uso: npm run restore:event -- <pasta-do-backup>
 */
function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
}

async function insertAll(c: any, table: string, rows: any[], conflict: string) {
  for (const r of rows) {
    const cols = Object.keys(r);
    const vals = cols.map((k) => (r[k] !== null && typeof r[k] === "object" && !(r[k] instanceof Date) && !Array.isArray(r[k]) ? JSON.stringify(r[k]) : r[k]));
    await c.query(
      `insert into ${table} (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")}) on conflict ${conflict} do nothing`,
      vals,
    );
  }
}

async function main() {
  const dir = process.argv[2];
  if (!dir || !fs.existsSync(path.join(dir, "event.json"))) throw new Error("Informe a pasta do backup (com event.json).");
  const data = JSON.parse(fs.readFileSync(path.join(dir, "event.json"), "utf8"));
  const objDir = path.join(dir, "objects");
  let uploaded = 0;
  for (const file of fs.existsSync(objDir) ? walk(objDir) : []) {
    const key = path.relative(objDir, file).split(path.sep).join("/");
    const head = await headObject(key);
    if (head && head.size === fs.statSync(file).size) continue;
    const type = key.endsWith(".webp") ? "image/webp" : key.endsWith(".mp4") ? "video/mp4" : key.endsWith(".png") ? "image/png" : key.endsWith(".mov") ? "video/quicktime" : "image/jpeg";
    await putObject(key, fs.readFileSync(file), type);
    uploaded++;
  }
  const event = { ...data.event, face_search_enabled: false, face_collection_id: null, created_by: null };
  const media = data.media.map((m: any) => ({
    ...m,
    face_status: "off",
    face_count: 0,
    face_indexed_at: null,
    consent_set_by: null,
    image_use_set_by: null,
    upload_id: null,
    status: m.status === "uploading" ? "failed" : m.status === "processing" || m.status === "received" ? "received" : m.status,
  }));
  await tx(async (c) => {
    await insertAll(c, "events", [event], "(id)");
    await insertAll(c, "media", media.map((m: any) => ({ ...m, duplicate_of: null })), "(id)");
    for (const m of media) if (m.duplicate_of) await c.query("update media set duplicate_of=$2 where id=$1", [m.id, m.duplicate_of]);
    await insertAll(c, "consent_records", data.consentRecords, "(id)");
    await insertAll(c, "media_consents", data.mediaConsents, "(media_id, consent_id)");
    await insertAll(c, "share_links", data.shareLinks.map((s: any) => ({ ...s, created_by: null })), "(id)");
    for (const m of media.filter((x: any) => x.status === "received")) {
      await enqueue("process_media", { mediaId: m.id }, { dedupeKey: `process:${m.id}` }, c);
    }
  });
  console.log(`Evento "${event.name}" restaurado: ${media.length} mídias, ${uploaded} arquivo(s) enviados ao armazenamento.`);
  console.log("A busca facial foi restaurada desligada; ligue no painel se ainda estiver dentro do prazo.");
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(closePool);
