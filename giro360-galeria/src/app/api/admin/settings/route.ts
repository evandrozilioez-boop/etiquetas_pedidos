import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { HttpError, json, readJson, route } from "@/lib/http";
import { getSettings, setSetting } from "@/lib/settings";
import { presignGet } from "@/lib/storage";
import { audit } from "@/lib/audit";

const body = z.object({
  whatsapp: z.string().trim().max(20).transform((v) => v.replace(/\D/g, "")),
  removalContact: z.string().trim().min(3, "Informe um canal para pedidos de remoção").max(160),
  portfolioTitle: z.string().trim().min(2, "Informe o título do portfólio").max(120),
  portfolioText: z.string().trim().max(400),
});

export const GET = route(async (req: Request) => {
  await requireAdmin(req);
  const s = await getSettings();
  return json({ settings: s, logoUrl: s.logoKey ? await presignGet(s.logoKey) : null });
});

export const PUT = route(async (req: Request) => {
  const admin = await requireAdmin(req);
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0]?.message ?? "Dados inválidos.");
  const d = parsed.data;
  if (d.whatsapp && (d.whatsapp.length < 12 || d.whatsapp.length > 13)) {
    throw new HttpError(400, "Informe o WhatsApp com DDI e DDD, só números. Ex.: 5548999990000.");
  }
  await setSetting("whatsapp", d.whatsapp);
  await setSetting("removalContact", d.removalContact);
  await setSetting("portfolioTitle", d.portfolioTitle);
  await setSetting("portfolioText", d.portfolioText);
  await audit(admin.id, "settings.update");
  return json({ ok: true });
});
