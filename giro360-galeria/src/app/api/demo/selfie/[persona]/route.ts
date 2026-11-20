import { isMockFaces } from "@/lib/config";
import { demoSelfie } from "@/lib/demo-media";

type Ctx = { params: Promise<{ persona: string }> };

/** Selfies de teste do modo demonstração (inexistente fora do modo simulado). */
export async function GET(_req: Request, ctx: Ctx) {
  if (!isMockFaces()) return new Response("Não encontrado", { status: 404 });
  const n = Number((await ctx.params).persona);
  if (!Number.isInteger(n) || n < 0 || n > 5) return new Response("Não encontrado", { status: 404 });
  const img = await demoSelfie(n);
  return new Response(new Uint8Array(img), { headers: { "Content-Type": "image/jpeg", "Content-Disposition": `inline; filename="selfie-teste-${n}.jpg"` } });
}
