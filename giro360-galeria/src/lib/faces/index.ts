import { config } from "../config";
import type { FaceProvider } from "./types";
import { MockFaceProvider } from "./mock";
import { RekognitionProvider } from "./rekognition";

let provider: FaceProvider | null = null;
let override: FaceProvider | null = null;

export function faceProvider(): FaceProvider {
  if (override) return override;
  if (!provider) provider = config().FACE_PROVIDER === "rekognition" ? new RekognitionProvider() : new MockFaceProvider();
  return provider;
}

/** Apenas para testes: substitui o provedor (ex.: simular indisponibilidade da IA). */
export function setFaceProviderForTests(p: FaceProvider | null) {
  override = p;
}

export function collectionIdFor(eventId: string) {
  return `${config().FACE_COLLECTION_PREFIX}-${eventId}`;
}
