import { NextFunction, Request, Response } from "express";
import { AppError } from "../utils/AppError";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ erro: err.message });
    return;
  }

  console.error(err);
  res.status(500).json({ erro: "Erro interno do servidor" });
}
