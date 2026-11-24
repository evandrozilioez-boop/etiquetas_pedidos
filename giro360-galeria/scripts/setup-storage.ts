import "./load-env";
import { ensureBucket } from "@/lib/storage";

/** Cria o bucket privado no MinIO local. No R2, o bucket e o CORS são criados pelo wrangler (docs/publicar.md). */
ensureBucket().catch((e) => {
  console.error("Falha ao preparar o armazenamento:", e.message);
  process.exitCode = 1;
});
