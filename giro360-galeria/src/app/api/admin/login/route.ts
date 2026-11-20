import { z } from "zod";
import { q, q1 } from "@/lib/db";
import { HttpError, clientKey, cookieHeader, json, readJson, route } from "@/lib/http";
import { ADMIN_COOKIE, adminSessionToken, checkPassword } from "@/lib/auth";
import { rateLimit, resetRateLimit } from "@/lib/rateLimit";
import { audit } from "@/lib/audit";

const body = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(200) });

export const POST = route(async (req: Request) => {
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, "Informe e-mail e senha.");
  const { email, password } = parsed.data;
  const key = `login:${clientKey(req)}:${email}`;
  await rateLimit(key, 8, 15 * 60, "Muitas tentativas de login. Aguarde 15 minutos.");
  const user = await q1<{ id: string; password_hash: string }>("select id, password_hash from admin_users where email=$1", [email]);
  if (!user || !(await checkPassword(password, user.password_hash))) {
    throw new HttpError(401, "E-mail ou senha incorretos.");
  }
  await resetRateLimit(key);
  await q("update admin_users set last_login_at=now() where id=$1", [user.id]);
  await audit(email, "admin.login");
  const { token, maxAge } = await adminSessionToken(user.id);
  return json({ ok: true }, { headers: { "Set-Cookie": cookieHeader(ADMIN_COOKIE, token, maxAge) } });
});
