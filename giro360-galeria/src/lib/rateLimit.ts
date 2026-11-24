import { q, q1 } from "./db";
import { HttpError } from "./http";

/**
 * Janela fixa persistida no D1 (funciona com várias instâncias).
 * Lança 429 quando o limite é excedido.
 */
export async function rateLimit(key: string, limit: number, windowSec: number, message: string) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - windowSec * 1000).toISOString();
  const row = await q1<{ count: number; window_start: string }>(
    `insert into rate_limits(key, window_start, count) values ($1, $2, 1)
     on conflict (key) do update set
       count = case when rate_limits.window_start < $3 then 1 else rate_limits.count + 1 end,
       window_start = case when rate_limits.window_start < $3 then $2 else rate_limits.window_start end
     returning count, window_start`,
    [key, now.toISOString(), cutoff],
  );
  if (row && row.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((new Date(row.window_start).getTime() + windowSec * 1000 - now.getTime()) / 1000));
    throw new HttpError(429, message, "rate_limited", { retryAfterSec: retryAfter });
  }
  return limit - (row?.count ?? 0);
}

export async function resetRateLimit(key: string) {
  await q("delete from rate_limits where key = $1", [key]);
}
