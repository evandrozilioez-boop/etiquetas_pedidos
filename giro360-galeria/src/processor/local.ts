import { ProcessorError, type Processor } from "@/lib/processor-types";
import * as h from "./handlers";
import { PermanentError } from "./media-tools";

/** Processador em processo (testes e scripts Node): mesmas funções do Container, sem HTTP. */
function wrap<A extends unknown[], R>(fn: (...a: A) => Promise<R>) {
  return async (...a: A): Promise<R> => {
    try {
      return await fn(...a);
    } catch (err) {
      throw new ProcessorError((err as Error).message, err instanceof PermanentError);
    }
  };
}

export const localProcessor: Processor = {
  process: wrap(h.processMedia),
  indexUnit: wrap(h.indexUnit),
  release: wrap(h.releaseMedia),
  selfie: wrap((r, image: Uint8Array) => h.selfie(r, Buffer.from(image))),
  cover: wrap(h.cover),
  deleteFaces: wrap(h.deleteFaces),
  deleteCollection: wrap(h.deleteCollection),
};
