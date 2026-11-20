import { ZodError } from "zod";
import { requireAdmin } from "@/lib/auth";
import { HttpError, json, readJson, route } from "@/lib/http";
import { initUpload } from "@/lib/media";
import { limitsForClient } from "@/lib/config";
import { isUuid } from "@/lib/tokens";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route(async (req: Request) => {
  await requireAdmin(req);
  return json(limitsForClient());
});

/** Inicia ou retoma o envio de um arquivo (idempotente pela impressão digital). */
export const POST = route(async (req: Request, ctx: Ctx) => {
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  if (!isUuid(id)) throw new HttpError(404, "Evento não encontrado.");
  try {
    return json(await initUpload(id, await readJson(req), admin.id));
  } catch (err) {
    if (err instanceof ZodError) throw new HttpError(400, "Dados do arquivo inválidos.");
    throw err;
  }
});
