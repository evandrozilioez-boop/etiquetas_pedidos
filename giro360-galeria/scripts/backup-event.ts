import "./load-env";
import fs from "node:fs";
import path from "node:path";
import { getObjectBuffer, keys, listKeys } from "@/lib/storage";
import { args, isRemote, lit, sql } from "./d1";

/**
 * Cópia de um evento para uma pasta local: registros do banco (JSON) + todos os arquivos (originais, prévias, capa).
 * Dados biométricos NÃO entram no backup (regra de privacidade): ao restaurar, o índice é recriado.
 *   npm run backup:event -- <id-do-evento> [pasta] --remote
 * O acesso ao R2 usa as credenciais S3_* do .env.
 */
async function main() {
  const [eventId, dest = path.join("backups", eventId ?? "")] = args();
  if (!eventId) throw new Error("Informe o id do evento.");
  const id = lit(eventId);
  const event = sql(`select * from events where id=${id}`)[0];
  if (!event) throw new Error("Evento não encontrado.");
  const data = {
    version: 2,
    exportedAt: new Date().toISOString(),
    source: isRemote() ? "produção" : "local",
    event,
    media: sql(`select * from media where event_id=${id}`),
    consentRecords: sql(`select * from consent_records where event_id=${id}`),
    mediaConsents: sql(`select mc.* from media_consents mc join media m on m.id = mc.media_id where m.event_id=${id}`),
    shareLinks: sql(`select * from share_links where event_id=${id}`),
  };
  fs.mkdirSync(path.join(dest, "objects"), { recursive: true });
  fs.writeFileSync(path.join(dest, "event.json"), JSON.stringify(data, null, 2));
  const objects = await listKeys(keys.eventPrefix(eventId));
  let bytes = 0;
  for (const o of objects) {
    const file = path.join(dest, "objects", o.key);
    if (fs.existsSync(file) && fs.statSync(file).size === o.size) continue; // retomável
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, await getObjectBuffer(o.key));
    bytes += o.size;
  }
  console.log(`Backup de "${event.name}": ${data.media.length} mídias, ${objects.length} arquivos (${(bytes / 1e6).toFixed(1)} MB novos) em ${dest}`);
}

main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
