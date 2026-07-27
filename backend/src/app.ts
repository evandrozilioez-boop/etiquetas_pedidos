import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import routes from "./routes";
import { errorHandler } from "./middlewares/errorHandler";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin }));
  app.use(express.json({ limit: "10mb" }));
  app.use(morgan("dev"));

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api", routes);

  app.use((_req, res) => {
    res.status(404).json({ erro: "Rota nao encontrada" });
  });

  app.use(errorHandler);

  return app;
}
