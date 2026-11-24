import { requireAdmin } from "@/lib/auth";
import { q, uuid } from "@/lib/db";
import { HttpError, json, readJson, route } from "@/lib/http";
import { getSettings, setSetting } from "@/lib/settings";
import { headObject, keys, presignPut } from "@/lib/storage";
import { audit } from "@/lib/audit";

/** Logo: o navegador envia direto ao armazenamento (URL assinada) e depois confirma. */
export const POST = route(async (req: Request) => {
  const admin = await requireAdmin(req);
  const body = await readJson<{ contentType?: string; size?: number; confirmKey?: string }>(req);
  if (body.confirmKey) {
    if (!/^brand\/logo-[0-9a-f-]{36}\.(png|jpg)$/.test(body.confirmKey)) throw new HttpError(400, "Envio de logo inválido.");
    const head = await headObject(body.confirmKey);
    if (!head || head.size > 5 * 1024 * 1024) throw new HttpError(400, "A logo não chegou ao armazenamento ou passa de 5 MB.");
    const old = (await getSettings()).logoKey;
    await setSetting("logoKey", body.confirmKey);
    if (old) await q("insert into deletion_tasks(target, ref) values ('object',$1)", [{ key: old }]);
    await audit(admin.id, "settings.logo");
    return json({ ok: true });
  }
  if (body.contentType !== "image/png" && body.contentType !== "image/jpeg") throw new HttpError(415, "Use PNG (de preferência com fundo transparente) ou JPEG.");
  if (!body.size || body.size > 5 * 1024 * 1024) throw new HttpError(413, "Logo acima de 5 MB.");
  const key = keys.logo(uuid(), body.contentType === "image/png" ? "png" : "jpg");
  return json({ url: await presignPut(key, body.contentType, 900), key });
});

export const DELETE = route(async (req: Request) => {
  const admin = await requireAdmin(req);
  const old = (await getSettings()).logoKey;
  await setSetting("logoKey", null);
  if (old) await q("insert into deletion_tasks(target, ref) values ('object',$1)", [{ key: old }]);
  await audit(admin.id, "settings.logo_remove");
  return json({ ok: true });
});
