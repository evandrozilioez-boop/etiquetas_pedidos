import jwt from "jsonwebtoken";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";
import { compararSenha } from "../utils/hash";
import { registrarHistorico } from "./historicoService";
import { AuthPayload } from "../middlewares/auth";

export async function login(login: string, senha: string) {
  const usuario = await prisma.usuario.findUnique({ where: { login } });

  if (!usuario || !usuario.ativo) {
    throw new AppError("Usuario ou senha invalidos", 401);
  }

  const senhaValida = await compararSenha(senha, usuario.senhaHash);
  if (!senhaValida) {
    throw new AppError("Usuario ou senha invalidos", 401);
  }

  const payload: AuthPayload = {
    sub: usuario.id,
    nome: usuario.nome,
    login: usuario.login,
    nivel: usuario.nivel,
  };

  const token = jwt.sign(payload, env.jwtSecret, { expiresIn: env.jwtExpiresIn } as jwt.SignOptions);

  await registrarHistorico({
    usuarioId: usuario.id,
    acao: "LOGIN",
    detalhes: `Login realizado por ${usuario.login}`,
  });

  return {
    token,
    usuario: {
      id: usuario.id,
      nome: usuario.nome,
      login: usuario.login,
      nivel: usuario.nivel,
    },
  };
}

export async function logout(usuarioId: string) {
  await registrarHistorico({
    usuarioId,
    acao: "LOGOUT",
    detalhes: "Logout realizado",
  });
}
