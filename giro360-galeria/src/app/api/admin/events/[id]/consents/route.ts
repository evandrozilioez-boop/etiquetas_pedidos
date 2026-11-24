import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { q, uuid } from "@/lib/db";
import { HttpError, json, readJson, route } from "@/lib/http";
import { isUuid } from "@/lib/tokens";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

const input = z.object({
  participantName: z.string().trim().min(2, "Informe o nome do participante").max(160),
  participantContact: z.string().trim().max(160).optional().nullable(),
  captureRef: z.string().trim().max(160).optional().nullable(),
  termVersion: z.string().trim().min(1).max(60),
  scope: z.enum(["face", "image_use", "face_and_image_use"]),
  notes: z.string().trim().max(500).optional().nullable(),
});

async function eventId(ctx: Ctx) {
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new HttpError(404, "Evento não encontrado.");
  return id;
}

export const GET = route(async (req: Request, ctx: Ctx) => {
  await requireAdmin(req);
  const rows = await q(
    `select id, participant_name, participant_contact, capture_ref, term_version, scope, collected_by, collected_at, notes, revoked_at
     from consent_records where event_id=$1 order by collected_at desc limit 500`,
    [await eventId(ctx)],
  );
  return json({ consents: rows });
});

export const POST = route(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin(req);
  const eventIdOf = await eventId(ctx);
  const parsed = input.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const d = parsed.data;
  const id = uuid();
  await q(
    `insert into consent_records(id, event_id, participant_name, participant_contact, capture_ref, term_version, scope, collected_by, notes)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [id, eventIdOf, d.participantName, d.participantContact ?? null, d.captureRef ?? null, d.termVersion, d.scope, admin.name, d.notes ?? null],
  );
  await audit(admin.id, "consent.create", { eventId: eventIdOf, details: { consentId: id, scope: d.scope } });
  return json({ id }, 201);
});
