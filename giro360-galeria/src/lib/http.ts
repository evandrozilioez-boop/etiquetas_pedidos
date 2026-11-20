import { NextResponse } from "next/server";
import { config } from "./config";
import { hmac } from "./tokens";

export class HttpError extends Error {
  constructor(public status: number, message: string, public code?: string, public extra?: Record<string, unknown>) {
    super(message);
  }
}

export function json(data: unknown, init?: number | ResponseInit) {
  const resInit = typeof init === "number" ? { status: init } : init;
  return NextResponse.json(data, { ...resInit, headers: { "Cache-Control": "no-store", ...(resInit?.headers ?? {}) } });
}

/** Envolve um handler de rota: converte HttpError em JSON e esconde detalhes de erros inesperados. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) {
        return json({ error: err.message, code: err.code, ...(err.extra ?? {}) }, err.status);
      }
      console.error("[erro]", (err as Error)?.stack ?? err);
      return json({ error: "Falha temporária. Tente novamente em instantes.", code: "internal" }, 500);
    }
  };
}

export function getCookie(req: Request, name: string): string | undefined {
  const header = req.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    if (part.slice(0, idx).trim() === name) return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return undefined;
}

export function cookieHeader(name: string, value: string, maxAgeSec: number, path = "/") {
  const secure = config().APP_URL.startsWith("https://") ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=${path}; Max-Age=${maxAgeSec}; HttpOnly; SameSite=Lax${secure}`;
}

/** IP do cliente (já transformado em hash; não armazenamos IP puro). */
export function clientKey(req: Request): string {
  let ip = "local";
  if (config().TRUST_PROXY) {
    ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  }
  return hmac(`ip:${ip}`).slice(0, 24);
}

export async function readJson<T = any>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, "Requisição inválida.");
  }
}
