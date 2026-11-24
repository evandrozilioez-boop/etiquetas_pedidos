/**
 * Acesso ao Cloudflare D1 (SQLite).
 * - No Worker (produção e `wrangler dev`), o banco vem do binding `DB`.
 * - Em scripts e testes (Node), `setDb()` recebe o binding local criado pelo `getPlatformProxy` do wrangler.
 *
 * Parâmetros usam `$1, $2…` (convertidos para `?1, ?2…`). Booleanos viram 0/1, datas viram texto ISO,
 * arrays viram JSON (use `in (select value from json_each($n))`). Colunas booleanas voltam como true/false.
 */

export type D1Result<T> = { results: T[]; meta?: { changes?: number } };
export interface D1Stmt {
  bind(...values: unknown[]): D1Stmt;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1Result<unknown>>;
}
export interface D1Like {
  prepare(sql: string): D1Stmt;
  batch(stmts: D1Stmt[]): Promise<D1Result<unknown>[]>;
  exec(sql: string): Promise<unknown>;
}

let override: D1Like | null = null;

export function setDb(db: D1Like | null) {
  override = db;
}

export async function db(): Promise<D1Like> {
  if (override) return override;
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const ctx = await getCloudflareContext({ async: true });
  return (ctx.env as unknown as { DB: D1Like }).DB;
}

const BOOL_COLS = new Set([
  "is_private",
  "allow_full_browse",
  "face_search_enabled",
  "show_in_portfolio",
  "published",
  "image_use",
  "highlight",
  "code_verified",
]);

function toParam(v: unknown): unknown {
  if (v === undefined) return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return JSON.stringify(v);
  if (v !== null && typeof v === "object") return JSON.stringify(v);
  return v;
}

function fixRow<T>(row: Record<string, unknown>): T {
  for (const k of Object.keys(row)) {
    if (BOOL_COLS.has(k) && (row[k] === 0 || row[k] === 1)) row[k] = row[k] === 1;
  }
  return row as T;
}

/** Converte `$1` em `?1` (SQLite aceita parâmetros numerados, inclusive repetidos). */
export function sqlOf(text: string) {
  return text.replace(/\$(\d+)/g, "?$1");
}

export type Statement = { sql: string; params?: unknown[] };

export async function stmt(s: Statement): Promise<D1Stmt> {
  const d = await db();
  const p = d.prepare(sqlOf(s.sql));
  return s.params?.length ? p.bind(...s.params.map(toParam)) : p;
}

export async function q<T = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await (await stmt({ sql: text, params })).all<Record<string, unknown>>();
  return (res.results ?? []).map((r) => fixRow<T>(r));
}

export async function q1<T = any>(text: string, params: unknown[] = []): Promise<T | null> {
  return (await q<T>(text, params))[0] ?? null;
}

/** Executa vários comandos de forma atômica (o D1 não tem transação interativa; o lote é tudo-ou-nada). */
export async function batch(statements: Statement[]): Promise<any[][]> {
  if (!statements.length) return [];
  const d = await db();
  const prepared = await Promise.all(statements.map((s) => stmt(s)));
  const res = await d.batch(prepared);
  return res.map((r) => ((r.results ?? []) as Record<string, unknown>[]).map((x) => fixRow(x)));
}

export const nowIso = () => new Date().toISOString();
export const plusSeconds = (sec: number, from = new Date()) => new Date(from.getTime() + sec * 1000).toISOString();
export const uuid = () => crypto.randomUUID();
