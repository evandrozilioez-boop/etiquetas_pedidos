import { requireAdmin } from "@/lib/auth";
import { HttpError, route } from "@/lib/http";
import { getMedia } from "@/lib/media";
import { getEvent } from "@/lib/events";
import { downloadName } from "@/lib/access";
import { presignGet } from "@/lib/storage";
import { isUuid } from "@/lib/tokens";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (req: Request, ctx: Ctx) => {
  await requireAdmin(req);
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new HttpError(404, "Arquivo não encontrado.");
  const m = await getMedia(id);
  const e = await getEvent(m.event_id);
  const variant = new URL(req.url).searchParams.get("v");
  const key = variant === "preview" ? m.preview_key : m.storage_key;
  if (!key) throw new HttpError(404, "Prévia ainda não disponível.");
  const signed = await presignGet(key, variant === "preview" ? {} : { downloadName: downloadName(e, m), contentType: m.content_type });
  return Response.redirect(signed, 302);
});
