import { requireAdmin } from "@/lib/auth";
import { HttpError, json, readJson, route } from "@/lib/http";
import { signParts } from "@/lib/media";
import { isUuid } from "@/lib/tokens";

type Ctx = { params: Promise<{ id: string; mediaId: string }> };

/** URLs assinadas para as partes pedidas (o navegador envia direto ao armazenamento). */
export const POST = route(async (req: Request, ctx: Ctx) => {
  await requireAdmin(req);
  const { id, mediaId } = await ctx.params;
  if (!isUuid(id) || !isUuid(mediaId)) throw new HttpError(404, "Arquivo não encontrado.");
  const { parts } = await readJson<{ parts: number[] }>(req);
  if (!Array.isArray(parts) || !parts.length) throw new HttpError(400, "Informe as partes.");
  return json({ urls: await signParts(id, mediaId, parts) });
});
