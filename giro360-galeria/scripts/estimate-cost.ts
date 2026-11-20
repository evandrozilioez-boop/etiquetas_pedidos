import "./load-env";
import { q1, closePool } from "@/lib/db";

/**
 * Estimativa de custo mensal (US$). Preços padrão de referência — CONFIRA os valores atuais nos sites
 * da Cloudflare e da AWS antes de usar para orçamento; podem ser trocados por variáveis de ambiente.
 *
 * Uso:
 *   npm run cost:estimate                         -> usa o uso real dos últimos 30 dias registrado no banco
 *   npm run cost:estimate -- --gb 500 --fotos 20000 --quadros 40000 --buscas 8000
 */
const PRICE = {
  r2PerGbMonth: Number(process.env.PRICE_R2_GB_MONTH ?? 0.015), // armazenamento R2 (sem cobrança de saída)
  r2FreeGb: Number(process.env.PRICE_R2_FREE_GB ?? 10),
  rekPerImage: Number(process.env.PRICE_REK_IMAGE ?? 0.001), // IndexFaces / SearchFacesByImage / DetectFaces (1º milhão/mês)
  rekFaceStoragePerMonth: Number(process.env.PRICE_REK_FACE_MONTH ?? 0.00001), // por rosto guardado na coleção
  hostingMonth: Number(process.env.PRICE_HOSTING_MONTH ?? 20), // site + worker + PostgreSQL (estimativa Railway)
};

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : undefined;
}

async function main() {
  let gb = arg("gb");
  let photos = arg("fotos");
  let frames = arg("quadros");
  let searches = arg("buscas");
  let faces = arg("rostos");
  if ([gb, photos, frames, searches].some((v) => v === undefined)) {
    const u = await q1<{ photos: string; frames: string; calls: string }>(
      `select coalesce(sum(units) filter (where kind='index_photo'),0) as photos,
              coalesce(sum(units) filter (where kind='index_video_frame'),0) as frames,
              coalesce(sum(units) filter (where kind in ('search','detect_selfie')),0) as calls
       from ai_usage where created_at > now() - interval '30 days'`,
    );
    const b = await q1<{ b: string }>("select coalesce(sum(size_bytes + derived_bytes),0) as b from media where status in ('received','processing','ready')");
    const f = await q1<{ n: string }>("select count(*) as n from face_records");
    gb ??= Number(b?.b ?? 0) / 1e9;
    photos ??= Number(u?.photos ?? 0);
    frames ??= Number(u?.frames ?? 0);
    searches ??= Number(u?.calls ?? 0) / 2; // cada busca = 1 detecção + 1 pesquisa
    faces ??= Number(f?.n ?? 0);
    console.log("(usando o uso real dos últimos 30 dias registrado no banco)\n");
  }
  faces ??= (photos! + frames!) * 2;
  const storage = Math.max(0, gb! - PRICE.r2FreeGb) * PRICE.r2PerGbMonth;
  const indexing = (photos! + frames!) * PRICE.rekPerImage;
  const search = searches! * 2 * PRICE.rekPerImage;
  const faceStore = faces * PRICE.rekFaceStoragePerMonth;
  const total = storage + indexing + search + faceStore + PRICE.hostingMonth;
  const fmt = (v: number) => `US$ ${v.toFixed(2)}`;
  console.log(`Armazenamento R2: ${gb!.toFixed(1)} GB ...................... ${fmt(storage)}`);
  console.log(`IA – indexação: ${photos} fotos + ${frames} quadros de vídeo ... ${fmt(indexing)}`);
  console.log(`IA – buscas por selfie: ${searches} (2 chamadas cada) .......... ${fmt(search)}`);
  console.log(`IA – rostos guardados: ${faces} ................................ ${fmt(faceStore)}`);
  console.log(`Hospedagem (site + worker + banco), estimativa ............. ${fmt(PRICE.hostingMonth)}`);
  console.log(`\nTotal estimado no mês: ${fmt(total)}`);
  console.log("\nObs.: download pelo R2 não é cobrado por volume. Confira os preços vigentes antes de orçar.");
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(closePool);
