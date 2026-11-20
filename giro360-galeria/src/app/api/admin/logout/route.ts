import { cookieHeader, json, route } from "@/lib/http";
import { ADMIN_COOKIE } from "@/lib/auth";

export const POST = route(async () => json({ ok: true }, { headers: { "Set-Cookie": cookieHeader(ADMIN_COOKIE, "", 0) } }));
