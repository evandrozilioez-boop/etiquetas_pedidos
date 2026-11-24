import {
  RekognitionClient,
  CreateCollectionCommand,
  DeleteCollectionCommand,
  IndexFacesCommand,
  DetectFacesCommand,
  SearchFacesByImageCommand,
  DeleteFacesCommand,
} from "@aws-sdk/client-rekognition";
import { config } from "@/lib/config";
import { FaceProviderError, type FaceProvider } from "@/lib/faces/types";

/**
 * Amazon Rekognition. Credenciais via cadeia padrão da AWS (AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY, perfil ou IAM role).
 * Imagens são enviadas como bytes (até 5 MB, já redimensionadas pelo chamador); nada é gravado em S3 da AWS.
 */
export class RekognitionProvider implements FaceProvider {
  readonly name = "rekognition" as const;
  private client = new RekognitionClient({ region: config().AWS_REGION, maxAttempts: 3 });

  private wrap(err: any): never {
    const name = err?.name ?? "Erro";
    const retryable = !["InvalidParameterException", "InvalidImageFormatException", "ImageTooLargeException"].includes(name);
    throw new FaceProviderError(`Rekognition: ${name}: ${err?.message ?? ""}`.slice(0, 500), retryable);
  }

  async ensureCollection(collectionId: string) {
    try {
      await this.client.send(new CreateCollectionCommand({ CollectionId: collectionId }));
    } catch (err: any) {
      if (err?.name === "ResourceAlreadyExistsException") return;
      this.wrap(err);
    }
  }

  async deleteCollection(collectionId: string) {
    try {
      await this.client.send(new DeleteCollectionCommand({ CollectionId: collectionId }));
    } catch (err: any) {
      if (err?.name === "ResourceNotFoundException") return;
      this.wrap(err);
    }
  }

  async indexFaces(collectionId: string, image: Buffer, externalId: string) {
    try {
      const r = await this.client.send(
        new IndexFacesCommand({
          CollectionId: collectionId,
          Image: { Bytes: image },
          ExternalImageId: externalId,
          MaxFaces: 100,
          QualityFilter: "AUTO",
          DetectionAttributes: [],
        }),
      );
      return (r.FaceRecords ?? []).map((f) => ({
        faceId: f.Face!.FaceId!,
        confidence: f.Face?.Confidence ?? 0,
        bbox: {
          left: f.Face?.BoundingBox?.Left ?? 0,
          top: f.Face?.BoundingBox?.Top ?? 0,
          width: f.Face?.BoundingBox?.Width ?? 0,
          height: f.Face?.BoundingBox?.Height ?? 0,
        },
      }));
    } catch (err) {
      this.wrap(err);
    }
  }

  async detectFaces(image: Buffer) {
    try {
      const r = await this.client.send(new DetectFacesCommand({ Image: { Bytes: image }, Attributes: ["DEFAULT"] }));
      return (r.FaceDetails ?? []).map((f) => ({
        confidence: f.Confidence ?? 0,
        bbox: {
          left: f.BoundingBox?.Left ?? 0,
          top: f.BoundingBox?.Top ?? 0,
          width: f.BoundingBox?.Width ?? 0,
          height: f.BoundingBox?.Height ?? 0,
        },
      }));
    } catch (err) {
      this.wrap(err);
    }
  }

  async searchByImage(collectionId: string, image: Buffer, threshold: number, maxFaces: number) {
    try {
      const r = await this.client.send(
        new SearchFacesByImageCommand({
          CollectionId: collectionId,
          Image: { Bytes: image },
          FaceMatchThreshold: threshold,
          MaxFaces: maxFaces,
          QualityFilter: "AUTO",
        }),
      );
      return (r.FaceMatches ?? []).map((m) => ({ faceId: m.Face!.FaceId!, similarity: m.Similarity ?? 0 }));
    } catch (err: any) {
      // Coleção ainda não criada (nenhuma mídia indexada) = nenhuma correspondência.
      if (err?.name === "ResourceNotFoundException") return [];
      this.wrap(err);
    }
  }

  async deleteFaces(collectionId: string, faceIds: string[]) {
    try {
      for (let i = 0; i < faceIds.length; i += 1000) {
        await this.client.send(new DeleteFacesCommand({ CollectionId: collectionId, FaceIds: faceIds.slice(i, i + 1000) }));
      }
    } catch (err: any) {
      if (err?.name === "ResourceNotFoundException") return;
      this.wrap(err);
    }
  }
}
