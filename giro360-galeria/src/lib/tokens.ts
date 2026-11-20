import crypto from "node:crypto";
import { config } from "./config";

/** Token aleatório URL-safe (padrão 24 bytes ≈ 192 bits). */
export function randomToken(bytes = 24): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/** Hash com chave secreta (HMAC) — usado para tokens de link e IPs, nunca guardamos o valor puro. */
export function hmac(value: string): string {
  return crypto.createHmac("sha256", config().SESSION_SECRET).update(value).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
