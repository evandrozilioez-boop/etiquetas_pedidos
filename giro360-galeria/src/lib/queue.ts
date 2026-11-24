/**
 * Fila persistente: Cloudflare Queues (binding `JOBS`). A entrega é "pelo menos uma vez", então todo
 * processamento é idempotente (a situação real fica na tabela `media`). Tentativas limitadas e fila de
 * mensagens mortas configuradas no wrangler.jsonc; a falha final marca a mídia como "falhou".
 */
export type JobType = "process_media" | "index_faces" | "process_cover";
export type JobMessage = { type: JobType; payload: Record<string, string> };

export interface QueueLike {
  send(body: JobMessage, opts?: { delaySeconds?: number }): Promise<unknown>;
}

let override: QueueLike | null = null;

export function setQueue(qu: QueueLike | null) {
  override = qu;
}

async function queue(): Promise<QueueLike> {
  if (override) return override;
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const ctx = await getCloudflareContext({ async: true });
  return (ctx.env as unknown as { JOBS: QueueLike }).JOBS;
}

export async function enqueue(type: JobType, payload: Record<string, string>, opts: { delaySeconds?: number } = {}) {
  await (await queue()).send({ type, payload }, opts.delaySeconds ? { delaySeconds: opts.delaySeconds } : undefined);
}
