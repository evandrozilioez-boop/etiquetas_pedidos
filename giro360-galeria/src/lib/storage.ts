import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  ListPartsCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  CreateBucketCommand,
  HeadBucketCommand,
  PutBucketCorsCommand,
  type Part,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "node:stream";
import { config } from "./config";

/**
 * Armazenamento privado compatível com S3 (Cloudflare R2 em produção, MinIO no ambiente local).
 * Nunca há leitura pública: toda visualização ou download passa por URL assinada de curta duração,
 * emitida somente depois de a aplicação autorizar o acesso.
 */

let internal: S3Client | null = null;
let publicClient: S3Client | null = null;

function makeClient(endpoint?: string) {
  const c = config();
  return new S3Client({
    region: c.S3_REGION,
    endpoint,
    forcePathStyle: c.S3_FORCE_PATH_STYLE,
    credentials: { accessKeyId: c.S3_ACCESS_KEY_ID, secretAccessKey: c.S3_SECRET_ACCESS_KEY },
    // R2/MinIO + URLs assinadas: não exigir checksums CRC adicionais do navegador.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

/** Cliente usado pelo servidor/worker (endpoint interno, ex.: http://minio:9000 no Docker). */
export function s3(): S3Client {
  if (!internal) internal = makeClient(config().S3_ENDPOINT);
  return internal;
}

/** Cliente usado só para assinar URLs que o navegador vai acessar (endpoint público). */
function signer(): S3Client {
  if (!publicClient) {
    const c = config();
    publicClient = c.S3_PUBLIC_ENDPOINT && c.S3_PUBLIC_ENDPOINT !== c.S3_ENDPOINT ? makeClient(c.S3_PUBLIC_ENDPOINT) : s3();
  }
  return publicClient;
}

const bucket = () => config().S3_BUCKET;

export const keys = {
  original: (eventId: string, mediaId: string, ext: string) => `events/${eventId}/originals/${mediaId}.${ext}`,
  derived: (eventId: string, mediaId: string, name: string) => `events/${eventId}/derived/${mediaId}/${name}`,
  cover: (eventId: string, id: string, ext: string) => `events/${eventId}/cover/${id}.${ext}`,
  eventPrefix: (eventId: string) => `events/${eventId}/`,
  logo: (id: string, ext: string) => `brand/logo-${id}.${ext}`,
};

export async function presignGet(
  key: string,
  opts: { downloadName?: string; contentType?: string; ttl?: number } = {},
): Promise<string> {
  const cmd = new GetObjectCommand({
    Bucket: bucket(),
    Key: key,
    ResponseContentDisposition: opts.downloadName ? contentDisposition(opts.downloadName) : undefined,
    ResponseContentType: opts.contentType,
    ResponseCacheControl: "private, max-age=600",
  });
  return getSignedUrl(signer(), cmd, { expiresIn: opts.ttl ?? config().SIGNED_URL_TTL_SEC });
}

export async function presignPut(key: string, contentType: string, ttl = 3600): Promise<string> {
  const cmd = new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType });
  return getSignedUrl(signer(), cmd, { expiresIn: ttl });
}

export function contentDisposition(filename: string) {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export async function headObject(key: string): Promise<{ size: number; contentType?: string } | null> {
  try {
    const r = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return { size: Number(r.ContentLength ?? 0), contentType: r.ContentType };
  } catch (err: any) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound" || err?.name === "NoSuchKey") return null;
    throw err;
  }
}

export async function getObjectStream(key: string): Promise<Readable> {
  const r = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  return r.Body as Readable;
}

export async function getObjectBuffer(key: string): Promise<Buffer> {
  const stream = await getObjectStream(key);
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks);
}

export async function putObject(key: string, body: Buffer | Readable, contentType: string) {
  await s3().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
}

export async function deleteObject(key: string) {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

/** Remove todos os objetos com um prefixo. Retorna quantos foram apagados. */
export async function deletePrefix(prefix: string): Promise<number> {
  let token: string | undefined;
  let total = 0;
  do {
    const list = await s3().send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, ContinuationToken: token }));
    const objs = (list.Contents ?? []).map((o) => ({ Key: o.Key! }));
    if (objs.length) {
      const r = await s3().send(new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: objs, Quiet: true } }));
      if (r.Errors?.length) throw new Error(`Falha ao apagar ${r.Errors.length} objeto(s): ${r.Errors[0].Message}`);
      total += objs.length;
    }
    token = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (token);
  return total;
}

export async function listKeys(prefix: string): Promise<{ key: string; size: number }[]> {
  const out: { key: string; size: number }[] = [];
  let token: string | undefined;
  do {
    const list = await s3().send(new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, ContinuationToken: token }));
    for (const o of list.Contents ?? []) out.push({ key: o.Key!, size: Number(o.Size ?? 0) });
    token = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (token);
  return out;
}

// ---------- Multipart (vídeos grandes, retomável) ----------

export async function createMultipart(key: string, contentType: string): Promise<string> {
  const r = await s3().send(new CreateMultipartUploadCommand({ Bucket: bucket(), Key: key, ContentType: contentType }));
  if (!r.UploadId) throw new Error("Armazenamento não retornou UploadId");
  return r.UploadId;
}

export async function presignPart(key: string, uploadId: string, partNumber: number, ttl = 3600) {
  const cmd = new UploadPartCommand({ Bucket: bucket(), Key: key, UploadId: uploadId, PartNumber: partNumber });
  return getSignedUrl(signer(), cmd, { expiresIn: ttl });
}

/** Partes já confirmadas pelo armazenamento — fonte da verdade para retomar um envio. */
export async function listParts(key: string, uploadId: string): Promise<{ partNumber: number; etag: string; size: number }[]> {
  const parts: Part[] = [];
  let marker: string | undefined;
  for (;;) {
    const r = await s3().send(
      new ListPartsCommand({ Bucket: bucket(), Key: key, UploadId: uploadId, PartNumberMarker: marker }),
    );
    parts.push(...(r.Parts ?? []));
    if (!r.IsTruncated) break;
    marker = r.NextPartNumberMarker;
  }
  return parts.map((p) => ({ partNumber: p.PartNumber!, etag: p.ETag!, size: Number(p.Size ?? 0) }));
}

export async function completeMultipart(key: string, uploadId: string, parts: { partNumber: number; etag: string }[]) {
  await s3().send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket(),
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts.sort((a, b) => a.partNumber - b.partNumber).map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })) },
    }),
  );
}

export async function abortMultipart(key: string, uploadId: string) {
  try {
    await s3().send(new AbortMultipartUploadCommand({ Bucket: bucket(), Key: key, UploadId: uploadId }));
  } catch (err: any) {
    if (err?.name === "NoSuchUpload" || err?.$metadata?.httpStatusCode === 404) return;
    throw err;
  }
}

export function isNoSuchUpload(err: any) {
  return err?.name === "NoSuchUpload" || err?.Code === "NoSuchUpload";
}

// ---------- Preparação do bucket (ambiente local / primeira configuração) ----------

export async function ensureBucket(log = console.log) {
  const c = config();
  try {
    await s3().send(new HeadBucketCommand({ Bucket: bucket() }));
    log(`Bucket "${bucket()}" já existe.`);
  } catch {
    await s3().send(new CreateBucketCommand({ Bucket: bucket() }));
    log(`Bucket "${bucket()}" criado (privado).`);
  }
  const origins = (c.S3_CORS_ORIGINS ?? c.APP_URL).split(",").map((s) => s.trim()).filter(Boolean);
  try {
    await s3().send(
      new PutBucketCorsCommand({
        Bucket: bucket(),
        CORSConfiguration: {
          CORSRules: [
            {
              AllowedOrigins: origins,
              AllowedMethods: ["GET", "PUT", "HEAD"],
              AllowedHeaders: ["*"],
              ExposeHeaders: ["ETag"],
              MaxAgeSeconds: 3600,
            },
          ],
        },
      }),
    );
    log(`CORS configurado para: ${origins.join(", ")}`);
  } catch (err: any) {
    // MinIO não implementa PutBucketCors (usa MINIO_API_CORS_ALLOW_ORIGIN); R2 implementa.
    log(`Aviso: CORS não aplicado pela API (${err?.name ?? err}). No MinIO isso é esperado.`);
  }
}
