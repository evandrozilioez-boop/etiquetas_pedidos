/**
 * Motor de envio do navegador: direto para o armazenamento (URLs assinadas), em partes para arquivos grandes,
 * com repetição por parte e retomada a partir das partes já confirmadas pelo armazenamento.
 */

export const EXT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  mp4: "video/mp4",
  m4v: "video/mp4",
  mov: "video/quicktime",
};

export function contentTypeOf(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const byExt = EXT_TYPES[ext];
  const accepted = ["image/jpeg", "image/png", "video/mp4", "video/quicktime"];
  if (accepted.includes(file.type)) return file.type;
  return byExt ?? null;
}

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const h = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Fallback (páginas sem HTTPS): FNV-1a de 64 bits em duas metades. Suficiente para identificar o envio.
  const bytes = new Uint8Array(data);
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < bytes.length; i++) {
    h1 = Math.imul(h1 ^ bytes[i], 16777619) >>> 0;
    h2 = Math.imul(h2 ^ bytes[bytes.length - 1 - i], 2246822519) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0") + bytes.length.toString(16);
}

/** Impressão digital do arquivo: nome, tamanho, data e amostras do conteúdo (início e fim). Rápida mesmo em vídeos de GB. */
export async function fingerprintFile(file: File): Promise<string> {
  const SAMPLE = 256 * 1024;
  const head = await file.slice(0, SAMPLE).arrayBuffer();
  const tail = await file.slice(Math.max(0, file.size - SAMPLE)).arrayBuffer();
  const meta = new TextEncoder().encode(`${file.name}|${file.size}|${file.lastModified}|`);
  const all = new Uint8Array(meta.length + head.byteLength + tail.byteLength);
  all.set(meta, 0);
  all.set(new Uint8Array(head), meta.length);
  all.set(new Uint8Array(tail), meta.length + head.byteLength);
  return `v1-${await sha256Hex(all.buffer)}`;
}

export class UploadError extends Error {
  constructor(message: string, public retryable = true, public code?: string) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitOnline() {
  if (typeof navigator === "undefined" || navigator.onLine) return;
  await new Promise<void>((resolve) => window.addEventListener("online", () => resolve(), { once: true }));
}

export async function api<T = any>(url: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new UploadError("Sem conexão com o servidor.", true, "network");
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new UploadError(j.error ?? `Erro ${r.status}`, r.status >= 500 || r.status === 429, j.code);
  return j as T;
}

/** PUT direto ao armazenamento, com progresso. Retorna quando o armazenamento confirma. */
function putWithProgress(url: string, body: Blob, contentType: string | null, onProgress: (loaded: number) => void, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    if (contentType) xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new UploadError(`Armazenamento respondeu ${xhr.status}`, xhr.status >= 500 || xhr.status === 403)));
    xhr.onerror = () => reject(new UploadError("Conexão interrompida.", true, "network"));
    xhr.ontimeout = () => reject(new UploadError("Tempo esgotado.", true, "network"));
    xhr.timeout = 10 * 60_000;
    signal.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.onabort = () => reject(new UploadError("Envio pausado.", true, "aborted"));
    xhr.send(body);
  });
}

async function withRetry<T>(fn: () => Promise<T>, tries: number, signal: AbortSignal, onRetry?: (n: number, e: Error) => void): Promise<T> {
  let last: Error | null = null;
  for (let i = 0; i < tries; i++) {
    if (signal.aborted) throw new UploadError("Envio pausado.", true, "aborted");
    await waitOnline();
    try {
      return await fn();
    } catch (err) {
      last = err as Error;
      if (err instanceof UploadError && (!err.retryable || err.code === "aborted")) throw err;
      onRetry?.(i + 1, last);
      await sleep(Math.min(20_000, 1000 * 2 ** i) + Math.random() * 500);
    }
  }
  throw last ?? new UploadError("Falha no envio.");
}

export type Plan =
  | { state: "already"; mediaId: string; status: string; duplicateOf: string | null }
  | { state: "single"; mediaId: string; url: string }
  | { state: "multipart"; mediaId: string; partSize: number; totalParts: number; completedParts: { partNumber: number; size: number }[] };

export type Progress = { mediaId?: string; sent: number; partsDone?: number; totalParts?: number; note?: string };

/**
 * Envia (ou retoma) um arquivo. Se a conexão cair, as partes já confirmadas ficam no armazenamento:
 * chamar de novo continua de onde parou.
 */
export async function uploadFile(
  base: string,
  file: File,
  meta: { fingerprint: string; contentType: string; consentGrantedAll: boolean },
  onProgress: (p: Progress) => void,
  signal: AbortSignal,
): Promise<{ mediaId: string; status: string; duplicateOf?: string | null }> {
  const plan = await withRetry(
    () => api<Plan>(`${base}/uploads`, { filename: file.name, size: file.size, contentType: meta.contentType, fingerprint: meta.fingerprint, consentGrantedAll: meta.consentGrantedAll }),
    4,
    signal,
  );
  if (plan.state === "already") {
    onProgress({ mediaId: plan.mediaId, sent: file.size });
    return { mediaId: plan.mediaId, status: plan.status, duplicateOf: plan.duplicateOf };
  }
  if (plan.state === "single") {
    onProgress({ mediaId: plan.mediaId, sent: 0 });
    let url = plan.url;
    await withRetry(
      async () => {
        try {
          await putWithProgress(url, file, meta.contentType, (l) => onProgress({ mediaId: plan.mediaId, sent: l }), signal);
        } catch (e) {
          // URL pode ter expirado: pede outra
          const again = await api<Plan>(`${base}/uploads`, { filename: file.name, size: file.size, contentType: meta.contentType, fingerprint: meta.fingerprint });
          if (again.state === "single") url = again.url;
          throw e;
        }
      },
      5,
      signal,
      (n) => onProgress({ mediaId: plan.mediaId, sent: 0, note: `conexão instável, tentativa ${n + 1}` }),
    );
  } else {
    await sendParts(base, file, plan, onProgress, signal);
  }
  const done = await withRetry(
    async () => {
      try {
        return await api<{ status: string }>(`${base}/uploads/${plan.mediaId}/complete`, {});
      } catch (e) {
        if (e instanceof UploadError && e.code === "parts_missing" && plan.state === "multipart") {
          // Alguma parte não foi registrada: reenvia só as que faltam.
          const fresh = await api<Plan>(`${base}/uploads`, { filename: file.name, size: file.size, contentType: meta.contentType, fingerprint: meta.fingerprint });
          if (fresh.state === "multipart") await sendParts(base, file, fresh, onProgress, signal);
          throw new UploadError("Reenviando partes que faltavam.", true);
        }
        throw e;
      }
    },
    4,
    signal,
  );
  onProgress({ mediaId: plan.mediaId, sent: file.size });
  return { mediaId: plan.mediaId, status: done.status };
}

async function sendParts(base: string, file: File, plan: Extract<Plan, { state: "multipart" }>, onProgress: (p: Progress) => void, signal: AbortSignal) {
  const done = new Map(plan.completedParts.map((p) => [p.partNumber, p.size]));
  const todo = Array.from({ length: plan.totalParts }, (_, i) => i + 1).filter((n) => !done.has(n));
  const inflight = new Map<number, number>();
  const report = (note?: string) => {
    const confirmed = [...done.values()].reduce((a, b) => a + b, 0);
    const partial = [...inflight.values()].reduce((a, b) => a + b, 0);
    onProgress({ mediaId: plan.mediaId, sent: Math.min(file.size, confirmed + partial), partsDone: done.size, totalParts: plan.totalParts, note });
  };
  report(done.size ? `retomando: ${done.size} de ${plan.totalParts} partes já confirmadas` : undefined);
  let urls: Record<number, string> = {};
  const queue = [...todo];
  const getUrl = async (n: number) => {
    if (!urls[n]) {
      const batch = [n, ...queue.slice(0, 19)];
      const r = await withRetry(() => api<{ urls: Record<number, string> }>(`${base}/uploads/${plan.mediaId}/parts`, { parts: batch }), 4, signal);
      urls = { ...urls, ...r.urls };
    }
    return urls[n];
  };
  const worker = async () => {
    while (queue.length) {
      const n = queue.shift()!;
      const blob = file.slice((n - 1) * plan.partSize, Math.min(file.size, n * plan.partSize));
      await withRetry(
        async () => {
          try {
            await putWithProgress(await getUrl(n), blob, null, (l) => (inflight.set(n, l), report()), signal);
          } catch (e) {
            delete urls[n];
            inflight.delete(n);
            throw e;
          }
        },
        6,
        signal,
        (k) => report(`conexão instável, repetindo parte ${n} (tentativa ${k + 1})`),
      );
      inflight.delete(n);
      done.set(n, blob.size);
      report();
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}
