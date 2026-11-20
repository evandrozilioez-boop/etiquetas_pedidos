import { requireAdmin } from "@/lib/auth";
import { createEvent, listEvents } from "@/lib/events";
import { HttpError, json, readJson, route } from "@/lib/http";
import { ZodError } from "zod";

export const GET = route(async (req: Request) => {
  await requireAdmin(req);
  return json({ events: await listEvents() });
});

export const POST = route(async (req: Request) => {
  const admin = await requireAdmin(req);
  try {
    const event = await createEvent(await readJson(req), admin.id);
    return json({ event }, 201);
  } catch (err) {
    if (err instanceof ZodError) throw new HttpError(400, err.issues[0]?.message ?? "Dados inválidos.");
    throw err;
  }
});
