import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { config } from "./config";
import { q1 } from "./db";
import { HttpError, getCookie } from "./http";

export const ADMIN_COOKIE = "g360_admin";
const ADMIN_TTL_SEC = 12 * 3600;

function key() {
  return new TextEncoder().encode(config().SESSION_SECRET);
}

export async function signJwt(payload: Record<string, unknown>, ttlSec: number, audience: string) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setAudience(audience)
    .setExpirationTime(Math.floor(Date.now() / 1000) + ttlSec)
    .sign(key());
}

export async function verifyJwt<T>(token: string | undefined, audience: string): Promise<T | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { audience });
    return payload as T;
  } catch {
    return null;
  }
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}
export async function checkPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash);
}

export type AdminUser = { id: string; email: string; name: string };

export async function adminSessionToken(userId: string) {
  return { token: await signJwt({ uid: userId }, ADMIN_TTL_SEC, "admin"), maxAge: ADMIN_TTL_SEC };
}

export async function getAdmin(req: Request): Promise<AdminUser | null> {
  return getAdminFromToken(getCookie(req, ADMIN_COOKIE));
}

export async function getAdminFromToken(token: string | undefined): Promise<AdminUser | null> {
  const payload = await verifyJwt<{ uid: string }>(token, "admin");
  if (!payload?.uid) return null;
  return q1<AdminUser>("select id, email, name from admin_users where id = $1", [payload.uid]);
}

export async function requireAdmin(req: Request): Promise<AdminUser> {
  const admin = await getAdmin(req);
  if (!admin) throw new HttpError(401, "Faça login no painel.", "unauthenticated");
  return admin;
}
