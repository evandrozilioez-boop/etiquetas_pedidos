import "../../scripts/load-env";
import os from "node:os";
import { config } from "@/lib/config";
import { claimJob, completeJob, failJob, type Job } from "@/lib/queue";
import { closePool } from "@/lib/db";
import { processMedia, markProcessingFailed, PermanentError } from "./media";
import { indexMediaFaces, markIndexFailed } from "./faces";
import { housekeeping, abortAbandonedUploads } from "./maintenance";

/**
 * Processo de trabalho separado da aplicação web. Consome a fila persistente (tabela jobs) com
 * FOR UPDATE SKIP LOCKED — vários workers podem rodar em paralelo sem pegar a mesma tarefa.
 */
const workerId = `${os.hostname()}:${process.pid}`;
let stopping = false;

export async function handle(job: Job) {
  switch (job.type) {
    case "process_media":
      return processMedia(job.payload.mediaId);
    case "index_faces":
      return indexMediaFaces(job.payload.mediaId);
    default:
      throw new PermanentError(`Tipo de tarefa desconhecido: ${job.type}`);
  }
}

async function onFinalFailure(job: Job, message: string) {
  if (job.type === "process_media") await markProcessingFailed(job.payload.mediaId, message);
  if (job.type === "index_faces") await markIndexFailed(job.payload.mediaId, message);
}

/** Executa uma tarefa da fila (exportado para os testes). */
export async function runOnce(): Promise<boolean> {
  const job = await claimJob(workerId);
  if (!job) return false;
  const started = Date.now();
  try {
    await handle(job);
    await completeJob(job.id);
    console.log(`[worker] ${job.type} #${job.id} concluída em ${Date.now() - started} ms`);
  } catch (err) {
    const message = (err as Error)?.message ?? String(err);
    const final = await failJob(job, message, err instanceof PermanentError);
    console.error(`[worker] ${job.type} #${job.id} falhou (tentativa ${job.attempts}/${job.max_attempts}): ${message}`);
    if (final) await onFinalFailure(job, message);
  }
  return true;
}

async function loop(slot: number) {
  while (!stopping) {
    try {
      const worked = await runOnce();
      if (!worked) await new Promise((r) => setTimeout(r, 1500 + slot * 250));
    } catch (err) {
      console.error("[worker] erro no laço:", err);
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
}

async function maintenanceLoop() {
  let tick = 0;
  while (!stopping) {
    try {
      const r = await housekeeping();
      if (r.facesPurged || r.deletions.processed) console.log("[worker] manutenção:", JSON.stringify(r));
      if (tick++ % 60 === 0) await abortAbandonedUploads();
    } catch (err) {
      console.error("[worker] manutenção falhou:", (err as Error).message);
    }
    await new Promise((r) => setTimeout(r, 60_000));
  }
}

async function main() {
  const c = config();
  console.log(`[worker] iniciado (${workerId}), concorrência ${c.WORKER_CONCURRENCY}, reconhecimento: ${c.FACE_PROVIDER}`);
  const loops = Array.from({ length: c.WORKER_CONCURRENCY }, (_, i) => loop(i));
  const shutdown = () => {
    if (stopping) return;
    console.log("[worker] encerrando após as tarefas em andamento…");
    stopping = true;
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  await Promise.race([Promise.all(loops), maintenanceLoop()]);
  await Promise.all(loops);
  await closePool();
}

if (process.argv[1] && /worker[\\/]index\.ts$|worker\.js$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
