import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { HttpError, json, readJson, route } from "@/lib/http";
import { deleteMediaPermanently, retryFailed, setConsent, setHighlight, setImageUse, setPublished } from "@/lib/media";
import { isUuid } from "@/lib/tokens";

type Ctx = { params: Promise<{ id: string }> };

const body = z.object({
  action: z.enum(["publish", "unpublish", "consent_grant", "consent_revoke", "image_use_grant", "image_use_revoke", "highlight", "unhighlight", "delete", "retry"]),
  mediaIds: z.array(z.string().uuid()).max(200).default([]),
  note: z.string().trim().max(500).optional().nullable(),
  consentIds: z.array(z.string().uuid()).max(200).default([]),
});

export const POST = route(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new HttpError(404, "Evento não encontrado.");
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) throw new HttpError(400, "Requisição inválida.");
  const { action, mediaIds, note, consentIds } = parsed.data;
  if (action !== "retry" && mediaIds.length === 0) throw new HttpError(400, "Selecione pelo menos um arquivo.");
  switch (action) {
    case "publish":
    case "unpublish":
      await setPublished(id, mediaIds, action === "publish", admin.id);
      break;
    case "consent_grant":
      await setConsent(id, mediaIds, "granted_all", note ?? null, consentIds, admin.id);
      break;
    case "consent_revoke":
      await setConsent(id, mediaIds, "pending", null, [], admin.id);
      break;
    case "image_use_grant":
    case "image_use_revoke":
      await setImageUse(id, mediaIds, action === "image_use_grant", note ?? null, admin.id);
      break;
    case "highlight":
    case "unhighlight":
      await setHighlight(id, mediaIds, action === "highlight", admin.id);
      break;
    case "delete":
      for (const m of mediaIds) await deleteMediaPermanently(id, m, admin.id);
      break;
    case "retry":
      return json(await retryFailed(id, mediaIds.length ? mediaIds : "all", admin.id));
  }
  return json({ ok: true });
});
