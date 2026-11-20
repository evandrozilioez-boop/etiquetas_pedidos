import { q1 } from "./db";
import { HttpError } from "./http";

/**
 * Janela fixa persistida no PostgreSQL (funciona com várias instâncias da aplicação).
 * Retorna quantas tentativas restam; lança 429 quando o limite é excedido.
 */
export async function rateLimit(key: string, limit: number, windowSec: number, message: string) {
  const row = await q1<{ count: number; window_start: Date }>(
    `insert into rate_limits(key, window_start, count) values ($1, now(), 1)
     on conflict (key) do update set
       count = case when rate_limits.window_start < now() - make_interval(secs => $2) then 1 else rate_limits.count + 1 end,
       window_start = case when rate_limits.window_start < now() - make_interval(secs => $2) then now() else rate_limits.window_start end
     returning count, window_start`,
    [key, windowSec],
  );
  if (row && row.count > limit) {
    const retryAfter = Math.max(1, Math.ceil((row.window_start.getTime() + windowSec * 1000 - Date.now()) / 1000));
    throw new HttpError(429, message, "rate_limited", { retryAfterSec: retryAfter });
  }
  return limit - (row?.count ?? 0);
}

export async function resetRateLimit(key: string) {
  await q1("delete from rate_limits where key = $1", [key]);
}
