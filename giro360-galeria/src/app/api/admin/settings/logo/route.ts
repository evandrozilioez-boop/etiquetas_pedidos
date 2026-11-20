import { requireAdmin } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { readImageFromForm, storeLogo } from "@/lib/images";
import { getSettings, setSetting } from "@/lib/settings";
import { q } from "@/lib/db";
import { audit } from "@/lib/audit";

export const POST = route(async (req: Request) => {
  const admin = await requireAdmin(req);
  const old = (await getSettings()).logoKey;
  const key = await storeLogo(await readImageFromForm(req));
  await setSetting("logoKey", key);
  if (old) await q("insert into deletion_tasks(target, ref) values ('object',$1)", [JSON.stringify({ key: old })]);
  await audit(admin.id, "settings.logo");
  return json({ ok: true });
});

export const DELETE = route(async (req: Request) => {
  const admin = await requireAdmin(req);
  const old = (await getSettings()).logoKey;
  await setSetting("logoKey", null);
  if (old) await q("insert into deletion_tasks(target, ref) values ('object',$1)", [JSON.stringify({ key: old })]);
  await audit(admin.id, "settings.logo_remove");
  return json({ ok: true });
});
