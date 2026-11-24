import { ProcessorError, type Processor } from "./processor-types";

/**
 * Cliente do processador de mídia.
 * - Produção: Container da Cloudflare (binding `PROCESSOR`), uma instância por mídia (o original fica em cache local).
 * - Desenvolvimento local: servidor Node em PROCESSOR_URL (`npm run processor`).
 * - Testes e scripts: implementação direta em processo (`setProcessor`).
 */

type Env = { PROCESSOR?: unknown; PROCESSOR_URL?: string; PROCESSOR_SECRET?: string };

let override: Processor | null = null;
export function setProcessor(p: Processor | null) {
  override = p;
}

type Fetcher = (name: string, path: string, init: { body: BodyInit; headers: Record<string, string> }) => Promise<Response>;

function fetcherFor(env: Env): Fetcher {
  const secret = env.PROCESSOR_SECRET ?? process.env.PROCESSOR_SECRET ?? "";
  const url = env.PROCESSOR_URL ?? process.env.PROCESSOR_URL;
  if (url) {
    return (_name, path, init) => fetch(url.replace(/\/$/, "") + path, { method: "POST", body: init.body, headers: { ...init.headers, "x-processor-key": secret } });
  }
  if (!env.PROCESSOR) throw new ProcessorError("Processador de mídia não configurado (PROCESSOR ou PROCESSOR_URL).");
  return async (name, path, init) => {
    // Uma instância do Container por nome (Durable Object): equivale ao getContainer() de @cloudflare/containers.
    const ns = env.PROCESSOR as { idFromName(n: string): unknown; get(id: unknown): { fetch(r: Request): Promise<Response> } };
    const stub = ns.get(ns.idFromName(name));
    return stub.fetch(new Request(`http://processor${path}`, { method: "POST", body: init.body, headers: { ...init.headers, "x-processor-key": secret } }));
  };
}

export function remoteProcessor(env: Env): Processor {
  const f = fetcherFor(env);
  async function call<T>(name: string, path: string, body: unknown): Promise<T> {
    const res = await f(name, path, { body: JSON.stringify(body), headers: { "content-type": "application/json" } });
    const j = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) throw new ProcessorError(j.error ?? `Processador respondeu ${res.status}`, !!j.permanent);
    return j as T;
  }
  return {
    process: (r) => call(`m-${r.mediaId}`, "/process", r),
    indexUnit: (r) => call(`m-${r.mediaId}`, "/index-unit", r),
    release: async (mediaId) => void (await call(`m-${mediaId}`, "/release", { mediaId }).catch(() => undefined)),
    cover: (r) => call(`cover`, "/cover", r),
    deleteFaces: async (r) => void (await call("admin", "/delete-faces", r)),
    deleteCollection: async (r) => void (await call("admin", "/delete-collection", r)),
    selfie: async (r, image) => {
      const res = await f("search", "/selfie", { body: image as BodyInit, headers: { "content-type": "application/octet-stream", "x-request": JSON.stringify(r) } });
      const j = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) throw new ProcessorError(j.error ?? `Processador respondeu ${res.status}`);
      return j;
    },
  };
}

export async function processor(): Promise<Processor> {
  if (override) return override;
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const ctx = await getCloudflareContext({ async: true });
  return remoteProcessor(ctx.env as unknown as Env);
}
