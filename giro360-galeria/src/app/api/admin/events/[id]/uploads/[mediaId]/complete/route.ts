import { requireAdmin } from "@/lib/auth";
import { HttpError, json, route } from "@/lib/http";
import { completeUpload } from "@/lib/media";
import { isUuid } from "@/lib/tokens";

type Ctx = { params: Promise<{ id: string; mediaId: string }> };

export const POST = route(async (req: Request, ctx: Ctx) => {
  await requireAdmin(req);
  const { id, mediaId } = await ctx.params;
  if (!isUuid(id) || !isUuid(mediaId)) throw new HttpError(404, "Arquivo não encontrado.");
  return json(await completeUpload(id, mediaId));
});
