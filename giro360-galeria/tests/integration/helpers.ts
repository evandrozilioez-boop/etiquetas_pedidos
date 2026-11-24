import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { q } from "@/lib/db";
import { deletePrefix, ensureBucket, resetStorageForTests } from "@/lib/storage";
import { hashPassword } from "@/lib/auth";
import { housekeeping } from "@/lib/jobs";
import { localEnv, applyMigrations } from "../../scripts/local-env";

import * as login from "@/app/api/admin/login/route";
import * as eventsRoute from "@/app/api/admin/events/route";
import * as uploads from "@/app/api/admin/events/[id]/uploads/route";
import * as parts from "@/app/api/admin/events/[id]/uploads/[mediaId]/parts/route";
import * as complete from "@/app/api/admin/events/[id]/uploads/[mediaId]/complete/route";

export const BASE = "http://localhost:3000";

let env: Awaited<ReturnType<typeof localEnv>> | null = null;

/** D1 local novo (workerd, como na Cloudflare), bucket de teste limpo, fila em memória e processador local. */
export async function resetAll() {
  resetStorageForTests();
  env = await localEnv({ persistPath: fs.mkdtempSync(path.join(os.tmpdir(), "giro360-test-d1-")) });
  await applyMigrations(env.env.DB as any);
  await ensureBucket(() => undefined);
  await deletePrefix("");
}

export async function disposeAll() {
  await env?.dispose();
}

export async function drain() {
  await env!.drain();
}

export function pendingJobs() {
  return env!.pending;
}

type CallOpts = { method?: string; body?: unknown; form?: FormData; cookie?: string; params?: Record<string, string>; headers?: Record<string, string> };

/** Chama um handler de rota do Next como o servidor faria. */
export async function call(handler: (req: Request, ctx: any) => Promise<Response>, url: string, o: CallOpts = {}) {
  const headers: Record<string, string> = { ...(o.headers ?? {}) };
  if (o.cookie) headers.cookie = o.cookie;
  let body: BodyInit | undefined;
  if (o.form) body = o.form;
  else if (o.body !== undefined) {
    body = JSON.stringify(o.body);
    headers["content-type"] = "application/json";
  }
  const req = new Request(BASE + url, { method: o.method ?? (body ? "POST" : "GET"), headers, body });
  return handler(req, { params: Promise.resolve(o.params ?? {}) });
}

export function cookieFrom(res: Response) {
  const sc = res.headers.get("set-cookie");
  return sc ? sc.split(";")[0] : "";
}

export async function adminCookie() {
  await q("insert into admin_users(id, email, name, password_hash) values ($1,'teste@giro360.local','Teste',$2) on conflict (email) do nothing", [
    crypto.randomUUID(),
    await hashPassword("senha-de-teste-123"),
  ]);
  const res = await call(login.POST, "/api/admin/login", { body: { email: "teste@giro360.local", password: "senha-de-teste-123" } });
  if (res.status !== 200) throw new Error(`login falhou: ${res.status} ${await res.text()}`);
  return cookieFrom(res);
}

export async function createEvent(cookie: string, overrides: Record<string, unknown> = {}) {
  const res = await call(eventsRoute.POST, "/api/admin/events", {
    cookie,
    body: { name: "Evento Teste", eventDate: new Date().toISOString().slice(0, 10), city: "Florianópolis/SC", isPrivate: true, accessCode: "TESTE1", ...overrides },
  });
  const j = await res.json();
  if (res.status !== 201) throw new Error(JSON.stringify(j));
  return j.event as { id: string; public_token: string; access_code: string };
}

export function fingerprint(buf: Buffer, name: string) {
  return crypto.createHash("sha256").update(name).update(String(buf.length)).update(buf.subarray(0, 262144)).update(buf.subarray(-262144)).digest("hex");
}

/**
 * Envia um arquivo pela mesma API que o navegador usa.
 * stopAfterParts simula a queda de conexão no meio de um envio multipart.
 */
export async function upload(
  cookie: string,
  eventId: string,
  buf: Buffer,
  name: string,
  type: string,
  opts: { stopAfterParts?: number; fp?: string; consent?: boolean } = {},
) {
  const fp = opts.fp ?? fingerprint(buf, name);
  const initRes = await call(uploads.POST, `/api/admin/events/${eventId}/uploads`, {
    cookie,
    params: { id: eventId },
    body: { filename: name, size: buf.length, contentType: type, fingerprint: fp, consentGrantedAll: opts.consent ?? true },
  });
  const plan = await initRes.json();
  if (initRes.status !== 200) throw new Error(`init: ${JSON.stringify(plan)}`);
  if (plan.state === "already") return { mediaId: plan.mediaId as string, plan, completed: true };
  if (plan.state === "single") {
    const put = await fetch(plan.url, { method: "PUT", body: new Uint8Array(buf), headers: { "Content-Type": type } });
    if (!put.ok) throw new Error(`PUT ${put.status}`);
  } else {
    const done = new Set<number>(plan.completedParts.map((p: any) => p.partNumber));
    const todo = Array.from({ length: plan.totalParts }, (_, i) => i + 1).filter((n) => !done.has(n));
    const sign = await call(parts.POST, "/x", { cookie, params: { id: eventId, mediaId: plan.mediaId }, body: { parts: todo } });
    const { urls } = await sign.json();
    let sent = 0;
    for (const n of todo) {
      if (opts.stopAfterParts !== undefined && sent >= opts.stopAfterParts) return { mediaId: plan.mediaId as string, plan, completed: false };
      const chunk = buf.subarray((n - 1) * plan.partSize, n * plan.partSize);
      const r = await fetch(urls[n], { method: "PUT", body: new Uint8Array(chunk) });
      if (!r.ok) throw new Error(`parte ${n}: ${r.status}`);
      sent++;
    }
  }
  const c = await call(complete.POST, "/x", { cookie, params: { id: eventId, mediaId: plan.mediaId } });
  if (c.status !== 200) throw new Error(`complete: ${await c.text()}`);
  return { mediaId: plan.mediaId as string, plan, completed: true };
}

export { housekeeping };
