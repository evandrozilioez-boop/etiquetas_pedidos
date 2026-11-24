import { AwsClient } from "aws4fetch";
import { config } from "./config";
export { keys } from "./storage-keys";

/**
 * Armazenamento privado compatível com S3 (Cloudflare R2 em produção, MinIO no ambiente local), via API S3
 * assinada (aws4fetch). Funciona igual no Worker, no Container de processamento e em scripts Node.
 * Nunca há leitura pública: toda visualização ou download passa por URL assinada de curta duração,
 * emitida somente depois de a aplicação autorizar o acesso.
 */

let client: AwsClient | null = null;
function aws() {
  if (!client) {
    const c = config();
    client = new AwsClient({ accessKeyId: c.S3_ACCESS_KEY_ID, secretAccessKey: c.S3_SECRET_ACCESS_KEY, service: "s3", region: c.S3_REGION });
  }
  return client;
}

export function resetStorageForTests() {
  client = null;
}

const encodeKey = (key: string) => key.split("/").map(encodeURIComponent).join("/");

function objectUrl(key: string, publicEndpoint = false) {
  const c = config();
  const base = (publicEndpoint ? c.S3_PUBLIC_ENDPOINT ?? c.S3_ENDPOINT : c.S3_ENDPOINT)?.replace(/\/$/, "");
  if (!base) throw new Error("S3_ENDPOINT não configurado");
  // Estilo de caminho (endpoint/bucket/chave): aceito por R2 e MinIO.
  return new URL(`${base}/${c.S3_BUCKET}${key ? "/" + encodeKey(key) : ""}`);
}

export class StorageError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

async function call(method: string, url: URL, init: { body?: BodyInit; headers?: Record<string, string> } = {}) {
  const res = await aws().fetch(url.toString(), { method, body: init.body, headers: init.headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const code = text.match(/<Code>([^<]+)<\/Code>/)?.[1];
    throw new StorageError(`Armazenamento: ${method} ${res.status} ${code ?? ""}`.trim(), res.status, code);
  }
  return res;
}

const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1];
const tags = (xml: string, name: string) => [...xml.matchAll(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "g"))].map((m) => m[1]);
const unxml = (s: string) => s.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#34;/g, '"');

async function presign(method: string, url: URL, ttl: number) {
  url.searchParams.set("X-Amz-Expires", String(ttl));
  const signed = await aws().sign(url.toString(), { method, aws: { signQuery: true } });
  return signed.url;
}

export function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function presignGet(key: string, opts: { downloadName?: string; contentType?: string; ttl?: number } = {}) {
  const url = objectUrl(key, true);
  if (opts.downloadName) url.searchParams.set("response-content-disposition", contentDisposition(opts.downloadName));
  if (opts.contentType) url.searchParams.set("response-content-type", opts.contentType);
  url.searchParams.set("response-cache-control", "private, max-age=600");
  return presign("GET", url, opts.ttl ?? config().SIGNED_URL_TTL_SEC);
}

export async function presignPut(key: string, _contentType: string, ttl = 3600) {
  return presign("PUT", objectUrl(key, true), ttl);
}

export async function headObject(key: string): Promise<{ size: number; contentType?: string } | null> {
  const res = await aws().fetch(objectUrl(key).toString(), { method: "HEAD" });
  if (res.status === 404) return null;
  if (!res.ok) throw new StorageError(`Armazenamento: HEAD ${res.status}`, res.status);
  return { size: Number(res.headers.get("content-length") ?? 0), contentType: res.headers.get("content-type") ?? undefined };
}

export async function getObject(key: string): Promise<Response> {
  return call("GET", objectUrl(key));
}

export async function getObjectBuffer(key: string): Promise<Uint8Array> {
  return new Uint8Array(await (await getObject(key)).arrayBuffer());
}

export async function putObject(key: string, body: Uint8Array | ArrayBuffer | string, contentType: string) {
  await call("PUT", objectUrl(key), { body: body as BodyInit, headers: { "Content-Type": contentType } });
}

export async function deleteObject(key: string) {
  const res = await aws().fetch(objectUrl(key).toString(), { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new StorageError(`Armazenamento: DELETE ${res.status}`, res.status);
}

export async function listKeys(prefix: string): Promise<{ key: string; size: number }[]> {
  const out: { key: string; size: number }[] = [];
  let token: string | undefined;
  do {
    const url = objectUrl("");
    url.searchParams.set("list-type", "2");
    url.searchParams.set("prefix", prefix);
    if (token) url.searchParams.set("continuation-token", token);
    const xml = await (await call("GET", url)).text();
    for (const c of tags(xml, "Contents")) out.push({ key: unxml(tag(c, "Key") ?? ""), size: Number(tag(c, "Size") ?? 0) });
    token = tag(xml, "IsTruncated") === "true" ? unxml(tag(xml, "NextContinuationToken") ?? "") : undefined;
  } while (token);
  return out;
}

/** Remove todos os objetos com um prefixo. Retorna quantos foram apagados. */
export async function deletePrefix(prefix: string): Promise<number> {
  const list = await listKeys(prefix);
  for (let i = 0; i < list.length; i += 8) await Promise.all(list.slice(i, i + 8).map((o) => deleteObject(o.key)));
  return list.length;
}

// ---------- Multipart (vídeos grandes, retomável) ----------

export async function createMultipart(key: string, contentType: string): Promise<string> {
  const url = objectUrl(key);
  url.searchParams.set("uploads", "");
  const xml = await (await call("POST", url, { headers: { "Content-Type": contentType } })).text();
  const id = tag(xml, "UploadId");
  if (!id) throw new Error("Armazenamento não retornou UploadId");
  return unxml(id);
}

export async function presignPart(key: string, uploadId: string, partNumber: number, ttl = 3600) {
  const url = objectUrl(key, true);
  url.searchParams.set("partNumber", String(partNumber));
  url.searchParams.set("uploadId", uploadId);
  return presign("PUT", url, ttl);
}

/** Partes já confirmadas pelo armazenamento — fonte da verdade para retomar um envio. */
export async function listParts(key: string, uploadId: string): Promise<{ partNumber: number; etag: string; size: number }[]> {
  const parts: { partNumber: number; etag: string; size: number }[] = [];
  let marker: string | undefined;
  for (;;) {
    const url = objectUrl(key);
    url.searchParams.set("uploadId", uploadId);
    if (marker) url.searchParams.set("part-number-marker", marker);
    const xml = await (await call("GET", url)).text();
    for (const p of tags(xml, "Part")) {
      parts.push({ partNumber: Number(tag(p, "PartNumber")), etag: unxml(tag(p, "ETag") ?? ""), size: Number(tag(p, "Size") ?? 0) });
    }
    if (tag(xml, "IsTruncated") !== "true") break;
    marker = tag(xml, "NextPartNumberMarker");
  }
  return parts;
}

export async function completeMultipart(key: string, uploadId: string, parts: { partNumber: number; etag: string }[]) {
  const url = objectUrl(key);
  url.searchParams.set("uploadId", uploadId);
  const body =
    "<CompleteMultipartUpload>" +
    [...parts]
      .sort((a, b) => a.partNumber - b.partNumber)
      .map((p) => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${p.etag.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</ETag></Part>`)
      .join("") +
    "</CompleteMultipartUpload>";
  const xml = await (await call("POST", url, { body, headers: { "Content-Type": "application/xml" } })).text();
  if (xml.includes("<Error>")) throw new StorageError(`Armazenamento: falha ao concluir envio (${tag(xml, "Code")})`, 500, tag(xml, "Code"));
}

export async function abortMultipart(key: string, uploadId: string) {
  const url = objectUrl(key);
  url.searchParams.set("uploadId", uploadId);
  const res = await aws().fetch(url.toString(), { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new StorageError(`Armazenamento: abort ${res.status}`, res.status);
}

export function isNoSuchUpload(err: unknown) {
  return err instanceof StorageError && (err.code === "NoSuchUpload" || err.status === 404);
}

/** Cria o bucket se não existir (usado no ambiente local com MinIO; no R2 o bucket é criado pelo wrangler). */
export async function ensureBucket(log = console.log) {
  const url = objectUrl("");
  const head = await aws().fetch(url.toString(), { method: "HEAD" });
  if (head.ok) {
    log(`Bucket "${config().S3_BUCKET}" já existe.`);
    return;
  }
  await call("PUT", url);
  log(`Bucket "${config().S3_BUCKET}" criado (privado).`);
}
