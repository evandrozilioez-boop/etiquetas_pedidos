import type { FaceMatch } from "./types";

export type FaceRef = { mediaId: string; frameMs: number | null };
export type GroupedResult = { mediaId: string; similarity: number; hits: number; bestFrameMs: number | null };

/**
 * Agrupa correspondências pelo arquivo de origem: vários rostos/quadros do mesmo vídeo
 * (a pessoa aparece em vários momentos do giro) viram um único resultado, com a maior similaridade.
 * Rostos sem referência local (mídia despublicada, de outro evento ou removida) são descartados.
 */
export function groupMatches(
  matches: FaceMatch[],
  refs: Map<string, FaceRef>,
  threshold: number,
  limit: number,
): GroupedResult[] {
  const byMedia = new Map<string, GroupedResult>();
  for (const m of matches) {
    if (m.similarity < threshold) continue;
    const ref = refs.get(m.faceId);
    if (!ref) continue;
    const cur = byMedia.get(ref.mediaId);
    if (!cur) {
      byMedia.set(ref.mediaId, { mediaId: ref.mediaId, similarity: m.similarity, hits: 1, bestFrameMs: ref.frameMs });
    } else {
      cur.hits += 1;
      if (m.similarity > cur.similarity) {
        cur.similarity = m.similarity;
        cur.bestFrameMs = ref.frameMs;
      }
    }
  }
  return [...byMedia.values()].sort((a, b) => b.similarity - a.similarity || b.hits - a.hits).slice(0, limit);
}

/**
 * Instantes (em segundos) dos quadros a extrair de um vídeo: distribuídos ao longo de todo o clipe
 * (centro de cada intervalo), nunca só o primeiro quadro. Limitado a maxFrames para controlar custo.
 */
export function frameTimestamps(durationSec: number, intervalSec: number, maxFrames: number): number[] {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return [0];
  const count = Math.max(1, Math.min(maxFrames, Math.floor(durationSec / intervalSec)));
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(Math.round(((durationSec * (i + 0.5)) / count) * 1000) / 1000);
  return out;
}
