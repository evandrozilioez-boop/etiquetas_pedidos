import type { BBox, FaceMatch } from "./faces/types";

/** Contrato entre o Worker (orquestra e grava no D1) e o Container de processamento (FFmpeg, sharp, IA). */
export type Provider = "none" | "mock" | "rekognition";

export type ProcessRequest = { mediaId: string; eventId: string; storageKey: string; sizeBytes: number; kind: "photo" | "video"; contentType: string };
export type ProcessResult = {
  sha256: string;
  width: number | null;
  height: number | null;
  durationSec: number | null;
  thumbKey: string;
  previewKey: string;
  posterKey: string | null;
  derivedBytes: number;
};

export type IndexUnitRequest = {
  mediaId: string;
  storageKey: string;
  sizeBytes: number;
  atSec: number | null;
  collectionId: string;
  provider: Provider;
  ensureCollection: boolean;
};
export type IndexedFaceOut = { faceId: string; confidence: number; bbox: BBox; persona?: number };
export type IndexUnitResult = { faces: IndexedFaceOut[] };

export type SelfieRequest = { provider: Provider; collectionId: string | null; threshold: number; maxFaces: number };
export type SelfieResult =
  | { ok: true; faces: { confidence: number; bbox: BBox; persona?: number }[]; matches: FaceMatch[] | null; searched: boolean }
  | { ok: false; code: "bad_image" | "too_dark" | "provider_error"; message?: string };

export type CoverRequest = { eventId: string; sourceKey: string };
export type CoverResult = { coverKey: string; thumbKey: string };

export type DeleteFacesRequest = { provider: Provider; collectionId: string; faceIds: string[] };
export type DeleteCollectionRequest = { provider: Provider; collectionId: string };

/** Erro devolvido pelo Container: permanente (não adianta repetir) ou temporário. */
export class ProcessorError extends Error {
  constructor(message: string, public permanent = false) {
    super(message);
  }
}

export interface Processor {
  process(r: ProcessRequest): Promise<ProcessResult>;
  indexUnit(r: IndexUnitRequest): Promise<IndexUnitResult>;
  release(mediaId: string): Promise<void>;
  selfie(r: SelfieRequest, image: Uint8Array): Promise<SelfieResult>;
  cover(r: CoverRequest): Promise<CoverResult>;
  deleteFaces(r: DeleteFacesRequest): Promise<void>;
  deleteCollection(r: DeleteCollectionRequest): Promise<void>;
}
