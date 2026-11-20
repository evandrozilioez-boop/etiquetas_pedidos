import { ZodError } from "zod";
import { requireAdmin } from "@/lib/auth";
import { deleteEvent, eventPublicUrl, eventStats, getEvent, updateEvent } from "@/lib/events";
import { HttpError, json, readJson, route } from "@/lib/http";
import { isUuid } from "@/lib/tokens";
import { presignGet } from "@/lib/storage";

type Ctx = { params: Promise<{ id: string }> };

async function eventId(ctx: Ctx) {
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new HttpError(404, "Evento não encontrado.");
  return id;
}

export const GET = route(async (req: Request, ctx: Ctx) => {
  await requireAdmin(req);
  const event = await getEvent(await eventId(ctx));
  return json({
    event,
    publicUrl: eventPublicUrl(event),
    coverUrl: event.cover_thumb_key ? await presignGet(event.cover_thumb_key) : null,
    stats: await eventStats(event.id),
  });
});

export const PUT = route(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin(req);
  try {
    return json({ event: await updateEvent(await eventId(ctx), await readJson(req), admin.id) });
  } catch (err) {
    if (err instanceof ZodError) throw new HttpError(400, err.issues[0]?.message ?? "Dados inválidos.");
    throw err;
  }
});

export const DELETE = route(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin(req);
  const id = await eventId(ctx);
  const body = await readJson<{ confirmName?: string }>(req);
  const event = await getEvent(id);
  if ((body.confirmName ?? "").trim() !== event.name) {
    throw new HttpError(400, "Digite o nome do evento exatamente como aparece para confirmar a exclusão.");
  }
  await deleteEvent(id, admin.id);
  return json({ ok: true });
});
