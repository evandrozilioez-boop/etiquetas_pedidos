import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Consulta o D1 pelo wrangler: `--remote` = banco de produção na Cloudflare; sem a opção = banco local
 * (o mesmo de `wrangler dev`). Requer login no wrangler (`npx wrangler login`) ou CLOUDFLARE_API_TOKEN para o remoto.
 */
export const isRemote = () => process.argv.includes("--remote");
export const args = () => process.argv.slice(2).filter((a) => a !== "--remote");

function wrangler(extra: string[]) {
  const out = execFileSync("npx", ["wrangler", "d1", "execute", "giro360", isRemote() ? "--remote" : "--local", "--json", ...extra], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 256 * 1024 * 1024,
  });
  const start = out.indexOf("[");
  return JSON.parse(out.slice(start)) as { results: any[] }[];
}

export function sql<T = any>(command: string): T[] {
  return wrangler(["--command", command])[0]?.results ?? [];
}

export function sqlFile(statements: string[]) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "giro360-sql-")), "lote.sql");
  fs.writeFileSync(file, statements.join(";\n") + ";\n");
  wrangler(["--file", file]);
}

export function lit(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  return `'${String(v).replace(/'/g, "''")}'`;
}
