export type BBox = { left: number; top: number; width: number; height: number };

export type DetectedFace = { confidence: number; bbox: BBox };
export type IndexedFace = DetectedFace & { faceId: string };
export type FaceMatch = { faceId: string; similarity: number };

export class FaceProviderError extends Error {
  constructor(message: string, public retryable = true) {
    super(message);
  }
}

/**
 * Contrato do provedor de reconhecimento facial. Cada evento tem sua própria coleção:
 * toda indexação e toda busca recebem o collectionId do evento, nunca uma coleção global.
 */
export interface FaceProvider {
  readonly name: "mock" | "rekognition";
  ensureCollection(collectionId: string): Promise<void>;
  deleteCollection(collectionId: string): Promise<void>;
  /** Indexa todos os rostos detectáveis da imagem (inclusive grupos). */
  indexFaces(collectionId: string, image: Buffer, externalId: string): Promise<IndexedFace[]>;
  /** Detecção sem indexar — usada para validar a selfie (rostos, enquadramento). */
  detectFaces(image: Buffer): Promise<DetectedFace[]>;
  /** Busca no índice já criado. A imagem não é armazenada pelo provedor. */
  searchByImage(collectionId: string, image: Buffer, threshold: number, maxFaces: number): Promise<FaceMatch[]>;
  deleteFaces(collectionId: string, faceIds: string[]): Promise<void>;
}
