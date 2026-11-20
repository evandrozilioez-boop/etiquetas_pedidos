import QRCode from "qrcode";
import { requireAdmin } from "@/lib/auth";
import { eventPublicUrl, getEvent } from "@/lib/events";
import { HttpError, route } from "@/lib/http";
import { isUuid } from "@/lib/tokens";

type Ctx = { params: Promise<{ id: string }> };

/** QR do evento em PNG (1024 px) para imprimir ou exibir no estande. */
export const GET = route(async (req: Request, ctx: Ctx) => {
  await requireAdmin(req);
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new HttpError(404, "Evento não encontrado.");
  const event = await getEvent(id);
  const png = await QRCode.toBuffer(eventPublicUrl(event), { width: 1024, margin: 2, errorCorrectionLevel: "M" });
  const slug = event.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="qr-${slug}.png"`,
      "Cache-Control": "no-store",
    },
  });
});
