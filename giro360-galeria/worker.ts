/**
 * Entrada do Worker na Cloudflare:
 * - fetch: o site Next.js (gerado pelo OpenNext em .open-next/worker.js);
 * - queue: consumidor da fila de processamento (fotos, vídeos, índice facial, capas);
 * - scheduled: manutenção a cada 15 min (exclusões pendentes, prazo da biometria, envios abandonados);
 * - MediaProcessor: Container com Node + FFmpeg + sharp (+ Rekognition), sem acesso ao banco.
 */
// @ts-ignore gerado por `opennextjs-cloudflare build`
import { default as handler } from "./.open-next/worker.js";
import { Container } from "@cloudflare/containers";
import { setDb, type D1Like } from "./src/lib/db";
import { setQueue, type JobMessage, type QueueLike } from "./src/lib/queue";
import { remoteProcessor, setProcessor } from "./src/lib/processor";
import { handleJob, housekeeping, isPermanent, MAX_ATTEMPTS, onJobFailed } from "./src/lib/jobs";

type Env = Record<string, any> & { DB: D1Like; JOBS: QueueLike; PROCESSOR: any };

const PASS_TO_CONTAINER = [
  "APP_ENV",
  "APP_URL",
  "SESSION_SECRET",
  "S3_ENDPOINT",
  "S3_PUBLIC_ENDPOINT",
  "S3_REGION",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "FACE_PROVIDER",
  "AWS_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "PROCESSOR_SECRET",
];

export class MediaProcessor extends Container<Env> {
  defaultPort = 8080;
  sleepAfter = "10m";
  constructor(ctx: any, env: Env) {
    super(ctx, env);
    this.envVars = Object.fromEntries(PASS_TO_CONTAINER.filter((k) => typeof env[k] === "string").map((k) => [k, env[k] as string]));
  }
}

function bind(env: Env) {
  setDb(env.DB);
  setQueue(env.JOBS);
  setProcessor(remoteProcessor(env));
}

export default {
  fetch: handler.fetch,

  async queue(batch: { messages: { body: JobMessage; attempts: number; ack(): void; retry(o?: { delaySeconds?: number }): void }[] }, env: Env) {
    bind(env);
    for (const msg of batch.messages) {
      try {
        await handleJob(msg.body);
        msg.ack();
      } catch (err) {
        const message = (err as Error)?.message ?? String(err);
        console.error(`[fila] ${msg.body.type} falhou (tentativa ${msg.attempts}/${MAX_ATTEMPTS}): ${message}`);
        if (isPermanent(err) || msg.attempts >= MAX_ATTEMPTS) {
          await onJobFailed(msg.body, message);
          msg.ack();
        } else {
          msg.retry({ delaySeconds: Math.min(900, 15 * 2 ** (msg.attempts - 1)) });
        }
      }
    }
  },

  async scheduled(_event: unknown, env: Env, ctx: { waitUntil(p: Promise<unknown>): void }) {
    bind(env);
    ctx.waitUntil(
      housekeeping().then(
        (r) => console.log("[manutenção]", JSON.stringify(r)),
        (e) => console.error("[manutenção] falhou:", e?.message ?? e),
      ),
    );
  },
};
