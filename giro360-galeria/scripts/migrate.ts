import "./load-env";
import { runMigrations } from "@/lib/migrate";
import { closePool } from "@/lib/db";

runMigrations()
  .then(() => console.log("Banco atualizado."))
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(closePool);
