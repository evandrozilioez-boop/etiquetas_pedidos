import { HttpError, route } from "@/lib/http";
import { downloadName, resolveShareToken, touchShareLink } from "@/lib/access";
import { presignGet } from "@/lib/storage";

type Ctx = { params: Promise<{ token: string }> };

/** Download pelo QR individual. Não depende da IA: basta a mídia estar recebida e publicada. */
export const GET = route(async (req: Request, ctx: Ctx) => {
  const { token } = await ctx.params;
  const r = await resolveShareToken(token);
  if (!r) throw new HttpError(404, "Link inválido, expirado ou revogado.");
  if (r.state === "access_closed") throw new HttpError(403, "O prazo de download deste evento terminou.", "access_closed");
  await touchShareLink(r.linkId);
  const url = await presignGet(r.media.storage_key, { downloadName: downloadName(r.event, r.media), contentType: r.media.content_type });
  return Response.redirect(url, 302);
});
