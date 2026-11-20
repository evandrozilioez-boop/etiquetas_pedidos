import { HttpError, clientKey, json, route } from "@/lib/http";
import { loadEvent, requireGuest } from "@/lib/access";
import { rateLimit } from "@/lib/rateLimit";
import { searchBySelfie } from "@/lib/faces/search";

type Ctx = { params: Promise<{ token: string }> };

const MAX_SELFIE = 12 * 1024 * 1024;

/**
 * Busca por selfie. A imagem fica só em memória durante a requisição: não é gravada, não vai para logs
 * e não é enviada ao armazenamento. Limite de tentativas por sessão e por IP.
 */
export const POST = route(async (req: Request, ctx: Ctx) => {
  const { token } = await ctx.params;
  const event = await loadEvent(token);
  const session = await requireGuest(req, event);
  await rateLimit(`search:s:${session.id}`, 10, 10 * 60, "Muitas buscas seguidas. Aguarde alguns minutos.");
  await rateLimit(`search:ip:${event.id}:${clientKey(req)}`, 30, 60 * 60, "Muitas buscas a partir desta rede. Tente mais tarde.");

  if (Number(req.headers.get("content-length") ?? 0) > MAX_SELFIE + 512 * 1024) throw new HttpError(413, "Foto muito grande. Use uma foto de até 12 MB.");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "Envie a foto novamente.");
  }
  if (form.get("consent") !== "yes") {
    throw new HttpError(400, "Para buscar, confirme que autoriza o uso da selfie apenas nesta busca.", "need_consent");
  }
  const file = form.get("selfie");
  if (!(file instanceof Blob) || file.size === 0) throw new HttpError(400, "Envie uma foto.", "no_file");
  if (file.size > MAX_SELFIE) throw new HttpError(413, "Foto muito grande. Use uma foto de até 12 MB.");
  const result = await searchBySelfie(event, session, Buffer.from(await file.arrayBuffer()));
  return json(result);
});
