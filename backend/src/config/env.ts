import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Variavel de ambiente obrigatoria ausente: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 3333),
  host: process.env.HOST ?? "0.0.0.0",
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
  corsOrigin: process.env.CORS_ORIGIN ?? "*",
  printAdapter: (process.env.PRINT_ADAPTER ?? "mock") as "mock" | "network",
  // Quando definido, o backend passa a servir o build do frontend (SPA) a
  // partir desta pasta no mesmo processo/porta - usado no empacotamento
  // "single-PC" (instalador Windows), onde nao ha um servidor Vite separado.
  frontendDistPath: process.env.FRONTEND_DIST_PATH,
};
