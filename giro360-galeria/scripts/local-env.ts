import "./load-env";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getPlatformProxy } from "wrangler";
import { setDb, type D1Like } from "@/lib/db";
import { setQueue, type JobMessage } from "@/lib/queue";
import { setProcessor } from "@/lib/processor";
import { handleJob, isPermanent, MAX_ATTEMPTS, onJobFailed } from "@/lib/jobs";
import { localProcessor } from "@/processor/local";

/**
 * Ambiente local para scripts e testes (Node): D1 local do wrangler (o mesmo usado por `wrangler dev`),
 * fila em memória e processador em processo (FFmpeg/sharp desta máquina).
 */
export async function localEnv(opts: { persistPath?: string } = {}) {
  const main = fs.readFileSync(path.join(process.cwd(), "wrangler.jsonc"), "utf8").replace(/^\s*\/\/.*$/gm, "");
  const d1 = JSON.parse(main).d1_databases;
  const cfgPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "giro360-wr-")), "wrangler.json");
  fs.writeFileSync(cfgPath, JSON.stringify({ name: "giro360-local", compatibility_date: "2025-09-01", d1_databases: d1 }));
  const proxy = await getPlatformProxy({
    configPath: cfgPath,
    persist: { path: opts.persistPath ?? path.join(process.cwd(), ".wrangler/state/v3") },
  });
  setDb(proxy.env.DB as unknown as D1Like);
  const pending: JobMessage[] = [];
  setQueue({ send: async (m) => void pending.push(m) });
  setProcessor(localProcessor);

  /** Executa a fila em memória até esvaziar (como o consumidor da fila faria), com tentativas limitadas. */
  async function drain(max = 500) {
    const attempts = new Map<JobMessage, number>();
    for (let i = 0; i < max && pending.length; i++) {
      const msg = pending.shift()!;
      const n = (attempts.get(msg) ?? 0) + 1;
      try {
        await handleJob(msg);
      } catch (err) {
        if (isPermanent(err) || n >= MAX_ATTEMPTS) await onJobFailed(msg, (err as Error).message);
        else {
          attempts.set(msg, n);
          pending.push(msg);
        }
      }
    }
  }

  return { env: proxy.env, pending, drain, dispose: () => proxy.dispose() };
}

/** Aplica as migrações do D1 local (o mesmo que `wrangler d1 migrations apply --local`). */
export async function applyMigrations(db: D1Like) {
  await db.exec("create table if not exists d1_migrations (id integer primary key autoincrement, name text unique, applied_at text)");
  const done = new Set(((await db.prepare("select name from d1_migrations").all<{ name: string }>()).results ?? []).map((r) => r.name));
  const dir = path.join(process.cwd(), "migrations-d1");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    if (done.has(f)) continue;
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    const statements = sql
      .split(/;\s*$/m)
      .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
      .filter(Boolean);
    await db.batch([...statements.map((s) => db.prepare(s)), db.prepare("insert into d1_migrations(name, applied_at) values (?1, ?2)").bind(f, new Date().toISOString())]);
  }
}
