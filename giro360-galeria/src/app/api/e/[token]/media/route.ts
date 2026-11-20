import { json, route } from "@/lib/http";
import { listGuestMedia, loadEvent, requireGuest } from "@/lib/access";

type Ctx = { params: Promise<{ token: string }> };

/** Álbum completo (se o evento permitir) ou só as mídias liberadas pela busca desta sessão. */
export const GET = route(async (req: Request, ctx: Ctx) => {
  const { token } = await ctx.params;
  const event = await loadEvent(token);
  const session = await requireGuest(req, event);
  const url = new URL(req.url);
  return json({
    fullAlbum: event.allow_full_browse,
    ...(await listGuestMedia(event, session, { cursor: url.searchParams.get("cursor"), kind: url.searchParams.get("kind") })),
  });
});
