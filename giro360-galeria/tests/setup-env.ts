// Ambiente isolado de teste: banco giro360_test e bucket próprio no MinIO local.
process.env.APP_ENV = "test";
process.env.APP_URL = "http://localhost:3000";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://giro:giro@localhost:5432/giro360_test";
process.env.SESSION_SECRET = "dev-segredo-de-teste-com-mais-de-32-caracteres";
process.env.S3_ENDPOINT = process.env.TEST_S3_ENDPOINT ?? "http://localhost:9000";
process.env.S3_PUBLIC_ENDPOINT = process.env.S3_ENDPOINT;
process.env.S3_REGION = "us-east-1";
process.env.S3_BUCKET = "giro360-teste";
process.env.S3_ACCESS_KEY_ID = process.env.TEST_S3_ACCESS_KEY_ID ?? "giroadmin";
process.env.S3_SECRET_ACCESS_KEY = process.env.TEST_S3_SECRET_ACCESS_KEY ?? "giroadmin-secret";
process.env.S3_FORCE_PATH_STYLE = "true";
process.env.FACE_PROVIDER = "mock";
process.env.MULTIPART_PART_MB = "5";
process.env.VIDEO_FRAME_INTERVAL_SEC = "1";
process.env.VIDEO_MAX_FRAMES = "8";
process.env.WORKER_CONCURRENCY = "1";
