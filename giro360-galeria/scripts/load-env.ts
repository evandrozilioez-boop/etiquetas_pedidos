// Carrega .dev.vars e .env (se existirem) para scripts e para o processador local, sem sobrescrever o ambiente.
import fs from "node:fs";
import path from "node:path";

for (const name of [".dev.vars", ".env"]) {
  const file = path.join(process.cwd(), name);
  if (!fs.existsSync(file)) continue;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^"(.*)"$/, "$1");
  }
}
