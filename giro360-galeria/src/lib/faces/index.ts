import { config } from "../config";
import { FaceProviderError, type FaceProvider } from "./types";
import { MockFaceProvider } from "./mock";
import { RekognitionProvider } from "./rekognition";

let provider: FaceProvider | null = null;
let override: FaceProvider | null = null;

export function faceProvider(): FaceProvider {
  if (override) return override;
  if (!provider) {
    const p = config().FACE_PROVIDER;
    provider = p === "rekognition" ? new RekognitionProvider() : p === "mock" ? new MockFaceProvider() : new DisabledProvider();
  }
  return provider;
}

/** Apenas para testes: substitui o provedor (ex.: simular indisponibilidade da IA). */
export function setFaceProviderForTests(p: FaceProvider | null) {
  override = p;
}

export function collectionIdFor(eventId: string) {
  return `${config().FACE_COLLECTION_PREFIX}-${eventId}`;
}

/** FACE_PROVIDER=none: site no ar sem reconhecimento facial (galeria, QR e downloads funcionam normalmente). */
class DisabledProvider implements FaceProvider {
  readonly name = "rekognition" as const;
  private fail(): never {
    throw new FaceProviderError("Reconhecimento facial não configurado neste servidor.", false);
  }
  async ensureCollection() { this.fail(); }
  async deleteCollection() {}
  async indexFaces(): Promise<never> { this.fail(); }
  async detectFaces(): Promise<never> { this.fail(); }
  async searchByImage(): Promise<never> { this.fail(); }
  async deleteFaces() {}
}
