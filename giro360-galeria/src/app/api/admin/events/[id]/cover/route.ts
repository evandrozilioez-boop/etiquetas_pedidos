import { requireAdmin } from "@/lib/auth";
import { q1, uuid } from "@/lib/db";
import { HttpError, json, readJson, route } from "@/lib/http";
import { enqueue } from "@/lib/queue";
import { keys, presignPut } from "@/lib/storage";
import { isUuid } from "@/lib/tokens";
import { audit } from "@/lib/audit";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Capa do evento em duas etapas: (1) o navegador pede uma URL assinada e envia a imagem direto ao armazenamento;
 * (2) confirma, e o processador gera as versões WebP leves em segundo plano.
 */
export const POST = route(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  if (!isUuid(id) || !(await q1("select id from events where id=$1", [id]))) throw new HttpError(404, "Evento não encontrado.");
  const body = await readJson<{ contentType?: string; size?: number; confirmKey?: string }>(req);
  if (body.confirmKey) {
    if (!body.confirmKey.startsWith(keys.cover(id, "upload-", "").slice(0, -1))) throw new HttpError(400, "Envio de capa inválido.");
    await enqueue("process_cover", { eventId: id, sourceKey: body.confirmKey });
    await audit(admin.id, "event.cover", { eventId: id });
    return json({ ok: true });
  }
  if (body.contentType !== "image/jpeg" && body.contentType !== "image/png") throw new HttpError(415, "Use uma imagem JPEG ou PNG.");
  if (!body.size || body.size > 25 * 1024 * 1024) throw new HttpError(413, "Imagem acima de 25 MB.");
  const key = keys.cover(id, `upload-${uuid()}`, body.contentType === "image/png" ? "png" : "jpg");
  return json({ url: await presignPut(key, body.contentType, 900), key });
});
