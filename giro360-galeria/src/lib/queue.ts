import { q, q1, type Tx } from "./db";

export type JobType = "process_media" | "index_faces" | "purge_event";

export type Job = {
  id: number;
  type: JobType;
  payload: any;
  attempts: number;
  max_attempts: number;
};

type Runner = { query: Tx["query"] } | null;

/**
 * Enfileira uma tarefa. Com dedupeKey, não cria duplicata enquanto houver outra igual pendente/em execução —
 * evita processar (e cobrar IA) duas vezes quando o cliente repete a chamada.
 */
export async function enqueue(
  type: JobType,
  payload: Record<string, unknown>,
  opts: { dedupeKey?: string; maxAttempts?: number; delaySec?: number } = {},
  client: Runner = null,
) {
  const sql = `insert into jobs(type, payload, dedupe_key, max_attempts, run_at)
               values ($1, $2, $3, $4, now() + make_interval(secs => $5))
               on conflict (dedupe_key) where dedupe_key is not null and status in ('queued','running') do nothing
               returning id`;
  const params = [type, JSON.stringify(payload), opts.dedupeKey ?? null, opts.maxAttempts ?? 5, opts.delaySec ?? 0];
  if (client) return (await client.query(sql, params)).rows[0]?.id ?? null;
  return (await q1(sql, params))?.id ?? null;
}

export async function claimJob(workerId: string): Promise<Job | null> {
  return q1<Job>(
    `update jobs set status = 'running', locked_at = now(), locked_by = $1, attempts = attempts + 1, updated_at = now()
     where id = (select id from jobs where status = 'queued' and run_at <= now()
                 order by run_at, id for update skip locked limit 1)
     returning id, type, payload, attempts, max_attempts`,
    [workerId],
  );
}

export async function completeJob(id: number) {
  await q("update jobs set status = 'done', locked_at = null, updated_at = now() where id = $1", [id]);
}

/** Tentativas limitadas com espera exponencial; após o limite a tarefa fica como 'failed' (visível no painel). */
export async function failJob(job: Job, error: string, permanent = false) {
  const final = permanent || job.attempts >= job.max_attempts;
  const delay = Math.min(3600, 15 * 2 ** (job.attempts - 1));
  await q(
    `update jobs set status = $2, last_error = $3, locked_at = null, updated_at = now(),
       run_at = case when $2 = 'queued' then now() + make_interval(secs => $4) else run_at end
     where id = $1`,
    [job.id, final ? "failed" : "queued", error.slice(0, 2000), delay],
  );
  return final;
}

/** Recoloca na fila tarefas presas por um worker que caiu. */
export async function requeueStale(minutes = 30) {
  await q(
    `update jobs set status = 'queued', locked_at = null, updated_at = now()
     where status = 'running' and locked_at < now() - make_interval(mins => $1)`,
    [minutes],
  );
}
