import QRCode from "qrcode";
import { requireAdmin } from "@/lib/auth";
import { eventPublicUrl, getEvent } from "@/lib/events";
import { HttpError, route } from "@/lib/http";
import { isUuid } from "@/lib/tokens";

type Ctx = { params: Promise<{ id: string }> };

/** QR do evento em SVG (vetor: imprime nítido em qualquer tamanho). O PNG é gerado no navegador. */
export const GET = route(async (req: Request, ctx: Ctx) => {
  await requireAdmin(req);
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new HttpError(404, "Evento não encontrado.");
  const event = await getEvent(id);
  const svg = await QRCode.toString(eventPublicUrl(event), { type: "svg", margin: 2, errorCorrectionLevel: "M" });
  const slug = event.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase();
  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml", "Content-Disposition": `attachment; filename="qr-${slug}.svg"`, "Cache-Control": "no-store" },
  });
});
