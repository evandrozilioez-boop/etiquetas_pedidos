import { describe, expect, it } from "vitest";
import { frameTimestamps, groupMatches } from "@/lib/faces/grouping";
import { endOfDayPlus, extendedAccess } from "@/lib/events";
import { sniffType } from "@/processor/media-tools";

describe("groupMatches", () => {
  const refs = new Map([
    ["f1", { mediaId: "video", frameMs: 1000 }],
    ["f2", { mediaId: "video", frameMs: 5000 }],
    ["f3", { mediaId: "foto", frameMs: null }],
    ["f4", { mediaId: "outra", frameMs: null }],
  ]);

  it("um único resultado por vídeo, com a maior similaridade e o melhor instante", () => {
    const out = groupMatches(
      [
        { faceId: "f1", similarity: 93 },
        { faceId: "f2", similarity: 98 },
        { faceId: "f3", similarity: 95 },
      ],
      refs,
      90,
      10,
    );
    expect(out).toEqual([
      { mediaId: "video", similarity: 98, hits: 2, bestFrameMs: 5000 },
      { mediaId: "foto", similarity: 95, hits: 1, bestFrameMs: null },
    ]);
  });

  it("descarta rostos sem referência local e abaixo do limite; respeita o máximo", () => {
    const out = groupMatches(
      [
        { faceId: "desconhecido", similarity: 99 },
        { faceId: "f4", similarity: 80 },
        { faceId: "f3", similarity: 91 },
        { faceId: "f1", similarity: 92 },
      ],
      refs,
      90,
      1,
    );
    expect(out.map((o) => o.mediaId)).toEqual(["video"]);
  });
});

describe("frameTimestamps", () => {
  it("distribui quadros ao longo de todo o clipe, nunca só no início", () => {
    const t = frameTimestamps(30, 1.5, 24);
    expect(t).toHaveLength(20);
    expect(t[0]).toBeGreaterThan(0);
    expect(t[t.length - 1]).toBeLessThan(30);
    expect(t[t.length - 1]).toBeGreaterThan(28);
  });
  it("limita a quantidade máxima de quadros", () => {
    const t = frameTimestamps(600, 1, 24);
    expect(t).toHaveLength(24);
    expect(t[23]).toBeGreaterThan(580);
  });
  it("vídeo curto ou sem duração gera ao menos um quadro", () => {
    expect(frameTimestamps(0.5, 1.5, 24)).toHaveLength(1);
    expect(frameTimestamps(0, 1.5, 24)).toEqual([0]);
  });
});

describe("prazos", () => {
  it("acesso padrão termina no fim do dia (Brasília) N dias após o evento", () => {
    expect(endOfDayPlus("2026-11-14", 30).toISOString()).toBe("2026-12-15T02:59:59.000Z");
  });
  it("liberar +30 dias conta do fim do prazo atual ou de agora, o que for mais tarde", () => {
    const now = new Date("2026-11-20T12:00:00Z");
    expect(extendedAccess(new Date("2026-11-10T00:00:00Z"), 30, now).toISOString()).toBe("2026-12-20T12:00:00.000Z");
    expect(extendedAccess(new Date("2026-12-01T00:00:00Z"), 30, now).toISOString()).toBe("2026-12-31T00:00:00.000Z");
  });
});

describe("sniffType", () => {
  it("reconhece JPEG, PNG e MP4/MOV", () => {
    expect(sniffType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]))).toBe("jpeg");
    expect(sniffType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("png");
    expect(sniffType(Buffer.from([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74]))).toBe("isobmff");
    expect(sniffType(Buffer.from("%PDF-1.7 qualquer"))).toBeNull();
  });
});
