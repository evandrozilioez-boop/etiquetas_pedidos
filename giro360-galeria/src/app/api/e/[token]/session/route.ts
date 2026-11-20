import { json, readJson, route } from "@/lib/http";
import { loadEvent, openSession } from "@/lib/access";

type Ctx = { params: Promise<{ token: string }> };

/** Valida o código do evento (privado) ou abre a sessão (público). */
export const POST = route(async (req: Request, ctx: Ctx) => {
  const { token } = await ctx.params;
  const event = await loadEvent(token);
  const { code } = await readJson<{ code?: string }>(req).catch(() => ({ code: undefined }));
  const { setCookie } = await openSession(req, event, code);
  return json({ ok: true }, { headers: { "Set-Cookie": setCookie } });
});
