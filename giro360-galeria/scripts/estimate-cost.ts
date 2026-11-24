import "./load-env";
import { args, isRemote, sql } from "./d1";

/**
 * Estimativa de custo mensal (US$). Preços padrão de referência — CONFIRA os valores atuais nos sites
 * da Cloudflare e da AWS antes de usar para orçamento; podem ser trocados por variáveis de ambiente.
 *
 *   npm run cost:estimate -- --remote                -> uso real dos últimos 30 dias (produção)
 *   npm run cost:estimate -- --gb 500 --fotos 20000 --quadros 40000 --buscas 8000
 */
const PRICE = {
  r2PerGbMonth: Number(process.env.PRICE_R2_GB_MONTH ?? 0.015),
  r2FreeGb: Number(process.env.PRICE_R2_FREE_GB ?? 10),
  rekPerImage: Number(process.env.PRICE_REK_IMAGE ?? 0.001),
  rekFaceStoragePerMonth: Number(process.env.PRICE_REK_FACE_MONTH ?? 0.00001),
  // Workers Paid (inclui Workers, D1, Queues, Containers dentro da franquia mensal)
  cloudflarePlanMonth: Number(process.env.PRICE_CF_PLAN_MONTH ?? 5),
  // Uso de Container além da franquia (FFmpeg): estimativa por minuto de vídeo processado
  containerPerVideoMinute: Number(process.env.PRICE_CONTAINER_VIDEO_MIN ?? 0.002),
};

function arg(name: string) {
  const a = args();
  const i = a.indexOf(`--${name}`);
  return i >= 0 ? Number(a[i + 1]) : undefined;
}

function main() {
  let gb = arg("gb");
  let photos = arg("fotos");
  let frames = arg("quadros");
  let searches = arg("buscas");
  let faces = arg("rostos");
  let videoMin = arg("minutos-video");
  if ([gb, photos, frames, searches].some((v) => v === undefined)) {
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const u = sql(`select coalesce(sum(units) filter (where kind='index_photo'),0) as photos,
                         coalesce(sum(units) filter (where kind='index_video_frame'),0) as frames,
                         coalesce(sum(units) filter (where kind in ('search','detect_selfie')),0) as calls
                  from ai_usage where created_at > '${since}'`)[0] ?? {};
    const b = sql("select coalesce(sum(size_bytes + derived_bytes),0) as b from media where status in ('received','processing','ready')")[0] ?? {};
    const f = sql("select count(*) as n from face_records")[0] ?? {};
    const v = sql(`select coalesce(sum(duration_sec),0) as s from media where kind='video' and ready_at > '${since}'`)[0] ?? {};
    gb ??= Number(b.b ?? 0) / 1e9;
    photos ??= Number(u.photos ?? 0);
    frames ??= Number(u.frames ?? 0);
    searches ??= Number(u.calls ?? 0) / 2;
    faces ??= Number(f.n ?? 0);
    videoMin ??= Number(v.s ?? 0) / 60;
    console.log(`(uso real dos últimos 30 dias — banco ${isRemote() ? "de produção" : "local"})\n`);
  }
  faces ??= (photos! + frames!) * 2;
  videoMin ??= frames! / 20;
  const storage = Math.max(0, gb! - PRICE.r2FreeGb) * PRICE.r2PerGbMonth;
  const indexing = (photos! + frames!) * PRICE.rekPerImage;
  const search = searches! * 2 * PRICE.rekPerImage;
  const faceStore = faces * PRICE.rekFaceStoragePerMonth;
  const containers = videoMin * PRICE.containerPerVideoMinute;
  const total = storage + indexing + search + faceStore + containers + PRICE.cloudflarePlanMonth;
  const fmt = (v: number) => `US$ ${v.toFixed(2)}`;
  console.log(`Plano Cloudflare Workers Paid .................................. ${fmt(PRICE.cloudflarePlanMonth)}`);
  console.log(`Armazenamento R2: ${gb!.toFixed(1)} GB (10 GB grátis) .................. ${fmt(storage)}`);
  console.log(`Processamento de vídeo (Container): ${videoMin.toFixed(0)} min (estimativa) ... ${fmt(containers)}`);
  console.log(`IA – indexação: ${photos} fotos + ${frames} quadros ...................... ${fmt(indexing)}`);
  console.log(`IA – buscas por selfie: ${searches} (2 chamadas cada) ................... ${fmt(search)}`);
  console.log(`IA – rostos guardados: ${faces} ......................................... ${fmt(faceStore)}`);
  console.log(`\nTotal estimado no mês: ${fmt(total)}`);
  console.log("\nObs.: download pelo R2 não é cobrado por volume. Confira os preços vigentes antes de orçar.");
}

try {
  main();
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
}
