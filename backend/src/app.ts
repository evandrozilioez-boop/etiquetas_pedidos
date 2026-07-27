import path from "path";
import fs from "fs";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import routes from "./routes";
import { errorHandler } from "./middlewares/errorHandler";

export function createApp() {
  const app = express();

  const servirFrontend = !!env.frontendDistPath && fs.existsSync(env.frontendDistPath);

  // O CSP padrao do helmet bloqueia as tags <style> injetadas em runtime pelo
  // MUI/emotion. So relaxamos esse ponto quando o proprio backend serve o SPA
  // (empacotamento single-PC); em modo API-only o header nao afeta nada.
  app.use(helmet({ contentSecurityPolicy: servirFrontend ? false : undefined }));
  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json({ limit: "10mb" }));
  app.use(morgan("dev"));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api", routes);

  if (servirFrontend) {
    const dist = env.frontendDistPath as string;
    app.use(express.static(dist));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(dist, "index.html"));
    });
  } else {
    app.use((_req, res) => {
      res.status(404).json({ erro: "Rota nao encontrada" });
    });
  }

  app.use(errorHandler);

  return app;
}
