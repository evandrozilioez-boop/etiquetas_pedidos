import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { headObject, putObject } from "@/lib/storage";
import { args, isRemote, lit, sqlFile } from "./d1";

/**
 * Restaura um evento salvo por backup:event (mesmos ids: link do evento e QRs individuais continuam valendo).
 * Registros existentes são mantidos. A busca facial volta desligada; ao religar no painel, as mídias
 * autorizadas são indexadas de novo (isso gera custo de IA). Mídias que estavam em processamento voltam como
 * "falhou" — use "Tentar novamente" no painel para reprocessar.
 *   npm run restore:event -- <pasta-do-backup> --remote
 */
function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
}

function inserts(table: string, rows: Record<string, unknown>[]) {
  return rows.map((r) => {
    const cols = Object.keys(r);
    return `insert or ignore into ${table} (${cols.join(",")}) values (${cols.map((c) => lit(r[c])).join(",")})`;
  });
}

async function main() {
  const [dir] = args();
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
  const event = { ...data.event, face_search_enabled: 0, face_collection_id: null, created_by: null };
  const media = data.media.map((m: any) => ({
    ...m,
    face_status: "off",
    face_count: 0,
    face_indexed_at: null,
    upload_id: null,
    duplicate_of: null,
    status: ["uploading", "received", "processing"].includes(m.status) ? "failed" : m.status,
    error: ["uploading", "received", "processing"].includes(m.status) ? "Restaurado de backup: reprocessar." : m.error,
  }));
  sqlFile([
    ...inserts("events", [event]),
    ...inserts("media", media),
    ...data.media.filter((m: any) => m.duplicate_of).map((m: any) => `update media set duplicate_of=${lit(m.duplicate_of)} where id=${lit(m.id)}`),
    ...inserts("consent_records", data.consentRecords),
    ...inserts("media_consents", data.mediaConsents),
    ...inserts("share_links", data.shareLinks.map((s: any) => ({ ...s, created_by: null }))),
  ]);
  console.log(`Evento "${event.name}" restaurado (${isRemote() ? "produção" : "banco local"}): ${media.length} mídias, ${uploaded} arquivo(s) enviados.`);
  console.log("A busca facial foi restaurada desligada; ligue no painel se ainda estiver dentro do prazo.");
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
