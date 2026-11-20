import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { config } from "./config";

declare global {
  // eslint-disable-next-line no-var
  var __giroPool: Pool | undefined;
}

export function pool(): Pool {
  if (!globalThis.__giroPool) {
    globalThis.__giroPool = new Pool({ connectionString: config().DATABASE_URL, max: 10 });
  }
  return globalThis.__giroPool;
}

export async function q<T extends QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T[]> {
  const res = await pool().query<T>(text, params as any[]);
  return res.rows;
}

export async function q1<T extends QueryResultRow = any>(text: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}

export type Tx = PoolClient;

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (err) {
    await client.query("rollback").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (globalThis.__giroPool) {
    await globalThis.__giroPool.end();
    globalThis.__giroPool = undefined;
  }
}
