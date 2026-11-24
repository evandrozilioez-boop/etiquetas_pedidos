import "../../scripts/load-env";
import http from "node:http";
import * as h from "./handlers";
import { PermanentError } from "./media-tools";

/**
 * Servidor HTTP do Container de processamento (porta 8080). Só é alcançado pelo Worker
 * (binding de Container) ou, no ambiente local, pelo app em PROCESSOR_URL. Exige a chave compartilhada.
 * Nunca registra o conteúdo das requisições (a selfie passa por aqui só em memória).
 */
const SECRET = process.env.PROCESSOR_SECRET ?? "";
const MAX_JSON = 1024 * 1024;
const MAX_SELFIE = 12 * 1024 * 1024;

function readBody(req: http.IncomingMessage, limit: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("Corpo grande demais"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const routes: Record<string, (body: any) => Promise<unknown>> = {
  "/process": h.processMedia,
  "/index-unit": h.indexUnit,
  "/release": (b) => h.releaseMedia(b.mediaId).then(() => ({ ok: true })),
  "/cover": h.cover,
  "/delete-faces": (b) => h.deleteFaces(b).then(() => ({ ok: true })),
  "/delete-collection": (b) => h.deleteCollection(b).then(() => ({ ok: true })),
};

const server = http.createServer(async (req, res) => {
  const send = (status: number, data: unknown) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end(JSON.stringify(data));
  };
  try {
    if (req.method === "GET" && req.url === "/health") return send(200, { ok: true });
    if (SECRET && req.headers["x-processor-key"] !== SECRET) return send(401, { error: "não autorizado" });
    if (req.method !== "POST") return send(405, { error: "método não permitido" });
    if (req.url === "/selfie") {
      const meta = JSON.parse(String(req.headers["x-request"] ?? "{}"));
      const image = await readBody(req, MAX_SELFIE);
      return send(200, await h.selfie(meta, image));
    }
    const fn = routes[req.url ?? ""];
    if (!fn) return send(404, { error: "rota desconhecida" });
    const body = JSON.parse((await readBody(req, MAX_JSON)).toString("utf8") || "{}");
    const started = Date.now();
    const out = await fn(body);
    console.log(`[processador] ${req.url} ok em ${Date.now() - started} ms`);
    return send(200, out);
  } catch (err) {
    const permanent = err instanceof PermanentError;
    console.error(`[processador] ${req.url} falhou: ${(err as Error).message}`);
    return send(permanent ? 422 : 500, { error: (err as Error).message, permanent });
  }
});

const port = Number(process.env.PORT ?? 8080);
server.requestTimeout = 0;
server.listen(port, () => console.log(`[processador] ouvindo na porta ${port} (reconhecimento: ${process.env.FACE_PROVIDER ?? "mock"})`));
