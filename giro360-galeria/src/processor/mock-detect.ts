import sharp from "sharp";
import { MOCK_PERSONAS } from "@/lib/faces/personas";
import type { BBox, DetectedFace } from "@/lib/faces/types";

/**
 * DETECTOR SIMULADO — somente desenvolvimento e demonstração (bloqueado em APP_ENV=production).
 * Não reconhece rostos humanos: encontra os discos coloridos das pessoas fictícias da demonstração.
 */
const MIN_SHARE = 0.012; // fração mínima de pixels de uma cor para contar como "rosto"

function hsv(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max / 255 };
}

function hueDistance(a: number, b: number) {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export async function mockDetect(image: Buffer): Promise<(DetectedFace & { persona: number })[]> {
  const { data, info } = await sharp(image).rotate().resize(96, 96, { fit: "inside" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const total = info.width * info.height;
  const stats = MOCK_PERSONAS.map(() => ({ n: 0, minX: 1e9, minY: 1e9, maxX: -1, maxY: -1 }));
  for (let i = 0; i < total; i++) {
    const { h, s, v } = hsv(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);
    if (s < 0.55 || v < 0.4) continue;
    let best = -1;
    let bestD = 999;
    for (const p of MOCK_PERSONAS) {
      const dist = hueDistance(h, p.hue);
      if (dist < bestD) {
        bestD = dist;
        best = p.id;
      }
    }
    if (bestD > 18) continue;
    const st = stats[best];
    const x = i % info.width;
    const y = Math.floor(i / info.width);
    st.n++;
    st.minX = Math.min(st.minX, x);
    st.minY = Math.min(st.minY, y);
    st.maxX = Math.max(st.maxX, x);
    st.maxY = Math.max(st.maxY, y);
  }
  const out: (DetectedFace & { persona: number })[] = [];
  stats.forEach((st, persona) => {
    const share = st.n / total;
    if (share < MIN_SHARE) return;
    const bbox: BBox = {
      left: st.minX / info.width,
      top: st.minY / info.height,
      width: (st.maxX - st.minX + 1) / info.width,
      height: (st.maxY - st.minY + 1) / info.height,
    };
    out.push({ persona, confidence: Math.min(99.9, 90 + share * 40), bbox });
  });
  return out;
}

