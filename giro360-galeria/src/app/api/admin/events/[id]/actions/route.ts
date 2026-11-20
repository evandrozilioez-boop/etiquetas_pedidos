import { requireAdmin } from "@/lib/auth";
import { q } from "@/lib/db";
import { blockAccessNow, extendAccess, faceOpen, getEvent, purgeEventFaces, rotateEventToken } from "@/lib/events";
import { HttpError, json, readJson, route } from "@/lib/http";
import { isEligibleForIndex, queueIndexing, type MediaRow } from "@/lib/media";
import { facesAvailable } from "@/lib/config";
import { audit } from "@/lib/audit";
import { isUuid } from "@/lib/tokens";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new HttpError(404, "Evento não encontrado.");
  const { action } = await readJson<{ action: string }>(req);
  switch (action) {
    case "extend_access":
      return json({ event: await extendAccess(id, admin.id) });
    case "block_access":
      return json({ event: await blockAccessNow(id, admin.id) });
    case "rotate_link":
      return json({ token: await rotateEventToken(id, admin.id) });
    case "face_on": {
      if (!facesAvailable()) throw new HttpError(409, "O reconhecimento facial não está configurado neste servidor.");
      const e = await getEvent(id);
      if (e.face_purged_at || new Date(e.face_until) <= new Date()) {
        throw new HttpError(409, "O prazo da busca facial deste evento terminou e os dados biométricos foram apagados.");
      }
      await q("update events set face_search_enabled=true, updated_at=now() where id=$1", [id]);
      const event = await getEvent(id);
      const media = await q<MediaRow>(
        "select * from media where event_id=$1 and face_status in ('off','failed')",
        [id],
      );
      let queued = 0;
      for (const m of media) if (isEligibleForIndex(event, m)) (await queueIndexing(m.id, id), queued++);
      await audit(admin.id, "event.face_on", { eventId: id, details: { queued } });
      return json({ event, queued, faceOpen: faceOpen(event) });
    }
    case "face_off":
      await q("update events set face_search_enabled=false, updated_at=now() where id=$1", [id]);
      await audit(admin.id, "event.face_off", { eventId: id });
      return json({ event: await getEvent(id) });
    case "purge_faces":
      await purgeEventFaces(id, admin.id);
      return json({ event: await getEvent(id) });
    default:
      throw new HttpError(400, "Ação desconhecida.");
  }
});
