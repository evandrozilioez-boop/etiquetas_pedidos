import { z } from "zod";
import { q } from "@/lib/db";
import { HttpError, clientKey, json, readJson, route } from "@/lib/http";
import { rateLimit } from "@/lib/rateLimit";
import { findEventByToken } from "@/lib/events";

const body = z.object({
  eventToken: z.string().max(64).optional().nullable(),
  name: z.string().trim().min(2, "Informe seu nome").max(160),
  contact: z.string().trim().min(5, "Informe um e-mail ou telefone para retorno").max(160),
  message: z.string().trim().min(5, "Descreva o pedido").max(2000),
});

/** Pedido de remoção de imagem. Fica registrado para a equipe da Giro tratar pelo painel. */
export const POST = route(async (req: Request) => {
  await rateLimit(`removal:${clientKey(req)}`, 5, 3600, "Muitos pedidos seguidos. Tente mais tarde.");
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const d = parsed.data;
  const event = d.eventToken ? await findEventByToken(d.eventToken) : null;
  await q("insert into removal_requests(event_id, name, contact, message) values ($1,$2,$3,$4)", [event?.id ?? null, d.name, d.contact, d.message]);
  return json({ ok: true }, 201);
});
