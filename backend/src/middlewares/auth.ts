import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { NivelUsuario } from "@prisma/client";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";

export interface AuthPayload {
  sub: string;
  nome: string;
  login: string;
  nivel: NivelUsuario;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export function autenticar(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new AppError("Token de autenticacao ausente", 401);
  }

  const token = header.substring("Bearer ".length);

  try {
    const payload = jwt.verify(token, env.jwtSecret) as AuthPayload;
    req.auth = payload;
    next();
  } catch {
    throw new AppError("Token invalido ou expirado", 401);
  }
}

export function autorizar(...niveis: NivelUsuario[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      throw new AppError("Nao autenticado", 401);
    }
    if (!niveis.includes(req.auth.nivel)) {
      throw new AppError("Acesso negado para este nivel de usuario", 403);
    }
    next();
  };
}
