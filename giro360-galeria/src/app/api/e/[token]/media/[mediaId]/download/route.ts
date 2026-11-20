import { route } from "@/lib/http";
import { guestDownloadUrl, loadEvent } from "@/lib/access";

type Ctx = { params: Promise<{ token: string; mediaId: string }> };

/** Autoriza no servidor e redireciona para uma URL temporária do original. */
export const GET = route(async (req: Request, ctx: Ctx) => {
  const { token, mediaId } = await ctx.params;
  const event = await loadEvent(token);
  return Response.redirect(await guestDownloadUrl(req, event, mediaId), 302);
});
