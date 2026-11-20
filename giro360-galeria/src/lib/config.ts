import { z } from "zod";

/**
 * Configuração central lida das variáveis de ambiente.
 * Validada uma única vez; falhas de configuração impedem o início do processo.
 */
const bool = z
  .string()
  .optional()
  .transform((v) => v === "1" || v === "true" || v === "yes");

const schema = z.object({
  APP_ENV: z.enum(["development", "local", "test", "staging", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1).default("postgresql://giro:giro@localhost:5432/giro360"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET precisa ter pelo menos 32 caracteres"),

  S3_ENDPOINT: z.string().url().optional(),
  S3_PUBLIC_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().min(1).default("giro360-midias"),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: bool,
  S3_CORS_ORIGINS: z.string().optional(),

  FACE_PROVIDER: z.enum(["none", "mock", "rekognition"]).default("mock"),
  AWS_REGION: z.string().default("us-east-1"),
  FACE_COLLECTION_PREFIX: z.string().default("giro360"),
  FACE_MATCH_THRESHOLD: z.coerce.number().min(50).max(100).default(90),
  FACE_SEARCH_MAX_FACES: z.coerce.number().int().min(1).max(4096).default(1000),
  FACE_MAX_RESULTS: z.coerce.number().int().min(1).max(500).default(60),
  VIDEO_FRAME_INTERVAL_SEC: z.coerce.number().min(0.2).max(30).default(1.5),
  VIDEO_MAX_FRAMES: z.coerce.number().int().min(1).max(300).default(24),

  UPLOAD_MAX_PHOTO_MB: z.coerce.number().min(1).default(50),
  UPLOAD_MAX_VIDEO_MB: z.coerce.number().min(1).default(8192),
  MULTIPART_PART_MB: z.coerce.number().min(5).max(512).default(16),
  SIGNED_URL_TTL_SEC: z.coerce.number().int().min(30).max(3600).default(600),
  ACCESS_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
  ACCESS_EXTENSION_DAYS: z.coerce.number().int().min(1).max(3650).default(30),
  FACE_DAYS: z.coerce.number().int().min(1).max(3650).default(90),

  REMOVAL_REQUEST_CONTACT: z.string().default("privacidade@giro360.com.br"),
  WHATSAPP_NUMBER: z.string().default(""),
  ADMIN_EMAIL: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  COMPANY_NAME: z.string().default("Giro 360"),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
  TRUST_PROXY: bool,
});

export type AppConfig = z.infer<typeof schema>;

let cached: AppConfig | null = null;

export function config(): AppConfig {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuração inválida: ${issues}`);
  }
  const cfg = parsed.data;
  // O reconhecimento simulado nunca pode ser habilitado em produção.
  if (cfg.APP_ENV === "production" && cfg.FACE_PROVIDER === "mock") {
    throw new Error(
      "FACE_PROVIDER=mock não é permitido com APP_ENV=production. Configure FACE_PROVIDER=rekognition.",
    );
  }
  if (cfg.APP_ENV === "production" && cfg.SESSION_SECRET.startsWith("dev-")) {
    throw new Error("SESSION_SECRET de desenvolvimento não é permitido em produção.");
  }
  cached = cfg;
  return cfg;
}

export function resetConfigForTests() {
  cached = null;
}

export function isMockFaces(): boolean {
  return config().FACE_PROVIDER === "mock";
}

export function facesAvailable(): boolean {
  return config().FACE_PROVIDER !== "none";
}

export const ACCEPTED_TYPES = {
  "image/jpeg": { kind: "photo", ext: "jpg" },
  "image/png": { kind: "photo", ext: "png" },
  "video/mp4": { kind: "video", ext: "mp4" },
  "video/quicktime": { kind: "video", ext: "mov" },
} as const;

export type AcceptedType = keyof typeof ACCEPTED_TYPES;

export function limitsForClient() {
  const c = config();
  return {
    photoMaxMb: c.UPLOAD_MAX_PHOTO_MB,
    videoMaxMb: c.UPLOAD_MAX_VIDEO_MB,
    partMb: c.MULTIPART_PART_MB,
    accepted: Object.keys(ACCEPTED_TYPES),
    acceptedLabel: "JPEG, PNG, MP4 e MOV",
  };
}
