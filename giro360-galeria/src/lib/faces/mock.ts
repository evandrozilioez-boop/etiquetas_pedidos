import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { q, q1 } from "../db";
import type { BBox, DetectedFace, FaceProvider } from "./types";

/**
 * PROVEDOR SIMULADO — somente para desenvolvimento e demonstração (bloqueado em APP_ENV=production).
 *
 * Não reconhece rostos humanos. Cada "pessoa" fictícia da demonstração é um disco de cor bem saturada
 * (vermelho, amarelo, verde, ciano, azul ou magenta). O detector encontra essas cores na imagem; uma selfie
 * "corresponde" a todas as mídias em que a mesma cor aparece. Assim o fluxo completo (indexação por evento,
 * quadros de vídeo, agrupamento, um resultado por clipe) pode ser testado sem credenciais AWS.
 */
export const MOCK_PERSONAS = [
  { id: 0, name: "Ana", color: "#e5262b", hue: 0 },
  { id: 1, name: "Bruno", color: "#f2c800", hue: 52 },
  { id: 2, name: "Carla", color: "#19b33d", hue: 135 },
  { id: 3, name: "Diego", color: "#00b8d4", hue: 188 },
  { id: 4, name: "Elisa", color: "#2a4de8", hue: 229 },
  { id: 5, name: "Fábio", color: "#d61ec8", hue: 305 },
] as const;

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

export class MockFaceProvider implements FaceProvider {
  readonly name = "mock" as const;

  async ensureCollection(collectionId: string) {
    await q("insert into mock_collections(collection_id) values ($1) on conflict do nothing", [collectionId]);
  }
  async deleteCollection(collectionId: string) {
    await q("delete from mock_face_index where collection_id = $1", [collectionId]);
    await q("delete from mock_collections where collection_id = $1", [collectionId]);
  }
  async indexFaces(collectionId: string, image: Buffer, externalId: string) {
    const exists = await q1("select 1 from mock_collections where collection_id=$1", [collectionId]);
    if (!exists) throw new Error(`Coleção simulada inexistente: ${collectionId}`);
    const faces = await mockDetect(image);
    const out = [];
    for (const f of faces) {
      const faceId = randomUUID();
      await q("insert into mock_face_index(collection_id, face_id, persona, external_id) values ($1,$2,$3,$4)", [
        collectionId,
        faceId,
        f.persona,
        externalId,
      ]);
      out.push({ faceId, confidence: f.confidence, bbox: f.bbox });
    }
    return out;
  }
  async detectFaces(image: Buffer) {
    return (await mockDetect(image)).map(({ confidence, bbox }) => ({ confidence, bbox }));
  }
  async searchByImage(collectionId: string, image: Buffer, threshold: number, maxFaces: number) {
    const faces = await mockDetect(image);
    if (!faces.length) return [];
    // Como o Rekognition, a busca usa o maior rosto da imagem.
    const main = faces.sort((a, b) => b.bbox.width * b.bbox.height - a.bbox.width * a.bbox.height)[0];
    const rows = await q<{ face_id: string }>(
      "select face_id from mock_face_index where collection_id=$1 and persona=$2 limit $3",
      [collectionId, main.persona, maxFaces],
    );
    // Similaridade simulada determinística (acima do limite) para permitir ordenação estável.
    return rows
      .map((r) => ({ faceId: r.face_id, similarity: 97 + (parseInt(r.face_id.slice(0, 2), 16) / 255) * 2.5 }))
      .filter((m) => m.similarity >= threshold);
  }
  async deleteFaces(collectionId: string, faceIds: string[]) {
    await q("delete from mock_face_index where collection_id=$1 and face_id = any($2)", [collectionId, faceIds]);
  }
}
