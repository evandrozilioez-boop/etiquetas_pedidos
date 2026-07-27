import { createApp } from "./app";
import { env } from "./config/env";

const app = createApp();

app.listen(env.port, env.host, () => {
  console.log(`API de etiquetas de pedidos rodando em ${env.host}:${env.port}`);
});
