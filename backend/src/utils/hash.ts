import crypto from "crypto";
import bcrypt from "bcryptjs";

export function sha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

export async function hashSenha(senha: string): Promise<string> {
  return bcrypt.hash(senha, 10);
}

export async function compararSenha(senha: string, hash: string): Promise<boolean> {
  return bcrypt.compare(senha, hash);
}
