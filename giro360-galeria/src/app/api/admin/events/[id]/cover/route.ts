import { requireAdmin } from "@/lib/auth";
import { q, q1 } from "@/lib/db";
import { HttpError, json, route } from "@/lib/http";
import { readImageFromForm, storeCover } from "@/lib/images";
import { isUuid } from "@/lib/tokens";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

export const POST = route(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new HttpError(404, "Evento não encontrado.");
  const old = await q1<{ cover_key: string | null; cover_thumb_key: string | null }>("select cover_key, cover_thumb_key from events where id=$1", [id]);
  if (!old) throw new HttpError(404, "Evento não encontrado.");
  const { coverKey, thumbKey } = await storeCover(id, await readImageFromForm(req));
  await q("update events set cover_key=$2, cover_thumb_key=$3, updated_at=now() where id=$1", [id, coverKey, thumbKey]);
  for (const k of [old.cover_key, old.cover_thumb_key]) {
    if (k) await q("insert into deletion_tasks(event_id, target, ref) values ($1,'object',$2)", [id, JSON.stringify({ key: k })]);
  }
  await audit(admin.id, "event.cover", { eventId: id });
  return json({ ok: true });
});
