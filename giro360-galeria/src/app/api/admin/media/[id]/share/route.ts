import QRCode from "qrcode";
import { requireAdmin } from "@/lib/auth";
import { q } from "@/lib/db";
import { HttpError, json, readJson, route } from "@/lib/http";
import { getMedia } from "@/lib/media";
import { createShareLink, revokeShareLink } from "@/lib/access";
import { isUuid } from "@/lib/tokens";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (req: Request, ctx: Ctx) => {
  await requireAdmin(req);
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new HttpError(404, "Arquivo não encontrado.");
  const links = await q(
    "select id, token_hint, created_at, revoked_at, last_used_at, use_count from share_links where media_id=$1 order by created_at desc",
    [id],
  );
  return json({ links });
});

/** Gera um QR individual (o token aparece só nesta resposta; no banco fica apenas o hash). */
export const POST = route(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new HttpError(404, "Arquivo não encontrado.");
  const m = await getMedia(id);
  const link = await createShareLink(m.event_id, m.id, admin.id);
  const qr = await QRCode.toString(link.url, { type: "svg", margin: 2, errorCorrectionLevel: "M" });
  return json({ ...link, qr });
});

export const DELETE = route(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  const { linkId } = await readJson<{ linkId: string }>(req);
  if (!isUuid(id) || !isUuid(linkId)) throw new HttpError(404, "Link não encontrado.");
  const m = await getMedia(id);
  await revokeShareLink(m.event_id, linkId, admin.id);
  return json({ ok: true });
});
