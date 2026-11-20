import "./load-env";
import { ensureBucket } from "@/lib/storage";

/** Cria o bucket privado (se não existir) e aplica a regra de CORS para envio direto do navegador. */
ensureBucket()
  .then(() => console.log("Armazenamento pronto."))
  .catch((e) => {
    console.error("Falha ao preparar o armazenamento:", e.message);
    process.exitCode = 1;
  });
