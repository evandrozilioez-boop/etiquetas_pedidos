import { requireAdmin } from "@/lib/auth";
import { q } from "@/lib/db";
import { HttpError, json, readJson, route } from "@/lib/http";
import { isUuid } from "@/lib/tokens";
import { audit } from "@/lib/audit";

/** Marca um pedido de remoção como atendido (a remoção em si é feita em Mídias › Excluir). */
export const POST = route(async (req: Request) => {
  const admin = await requireAdmin(req);
  const { id } = await readJson<{ id: string }>(req);
  if (!isUuid(id)) throw new HttpError(404, "Pedido não encontrado.");
  await q("update removal_requests set status='done', handled_at=now() where id=$1", [id]);
  await audit(admin.id, "removal.done", { details: { id } });
  return json({ ok: true });
});
