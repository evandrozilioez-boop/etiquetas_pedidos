import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { q, q1, closePool } from "@/lib/db";
import { getObjectStream, keys, listKeys } from "@/lib/storage";

/**
 * Cópia de um evento para uma pasta local: registros do banco (JSON) + todos os arquivos (originais, prévias, capa).
 * Dados biométricos NÃO entram no backup (por regra de privacidade): ao restaurar, o índice é recriado.
 * Uso: npm run backup:event -- <id-do-evento> [pasta-destino]
 */
async function main() {
  const [eventId, dest = path.join("backups", eventId ?? "")] = process.argv.slice(2);
  if (!eventId) throw new Error("Informe o id do evento.");
  const event = await q1("select * from events where id=$1", [eventId]);
  if (!event) throw new Error("Evento não encontrado.");
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    event,
    media: await q("select * from media where event_id=$1", [eventId]),
    consentRecords: await q("select * from consent_records where event_id=$1", [eventId]),
    mediaConsents: await q("select mc.* from media_consents mc join media m on m.id = mc.media_id where m.event_id=$1", [eventId]),
    shareLinks: await q("select * from share_links where event_id=$1", [eventId]),
  };
  fs.mkdirSync(path.join(dest, "objects"), { recursive: true });
  fs.writeFileSync(path.join(dest, "event.json"), JSON.stringify(data, null, 2));
  const objects = await listKeys(keys.eventPrefix(eventId));
  let bytes = 0;
  for (const o of objects) {
    const file = path.join(dest, "objects", o.key);
    if (fs.existsSync(file) && fs.statSync(file).size === o.size) continue; // retomável
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await pipeline(await getObjectStream(o.key), fs.createWriteStream(file));
    bytes += o.size;
  }
  console.log(`Backup de "${event.name}": ${data.media.length} mídias, ${objects.length} arquivos (${(bytes / 1e6).toFixed(1)} MB novos) em ${dest}`);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(closePool);
