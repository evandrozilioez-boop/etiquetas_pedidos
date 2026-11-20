import fs from "node:fs";
import path from "node:path";
import { pool } from "./db";

/** Aplica, em ordem, os arquivos migrations/*.sql ainda não aplicados. */
export async function runMigrations(dir = path.join(process.cwd(), "migrations"), log = console.log) {
  const p = pool();
  await p.query(`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
  const applied = new Set((await p.query("select name from schema_migrations")).rows.map((r) => r.name));
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    const client = await p.connect();
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into schema_migrations(name) values ($1)", [file]);
      await client.query("commit");
      log(`migração aplicada: ${file}`);
    } catch (err) {
      await client.query("rollback");
      throw new Error(`Falha na migração ${file}: ${(err as Error).message}`);
    } finally {
      client.release();
    }
  }
}
