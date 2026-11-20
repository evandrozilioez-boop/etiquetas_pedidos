import { requireAdmin } from "@/lib/auth";
import { HttpError, json, route } from "@/lib/http";
import { listMediaAdmin } from "@/lib/media";
import { isUuid } from "@/lib/tokens";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (req: Request, ctx: Ctx) => {
  await requireAdmin(req);
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new HttpError(404, "Evento não encontrado.");
  const url = new URL(req.url);
  const ids = url.searchParams.get("ids");
  return json(
    await listMediaAdmin(id, {
      cursor: url.searchParams.get("cursor"),
      filter: url.searchParams.get("filter"),
      limit: Number(url.searchParams.get("limit") ?? 48),
      ids: ids ? ids.split(",").filter(isUuid).slice(0, 100) : undefined,
    }),
  );
});
