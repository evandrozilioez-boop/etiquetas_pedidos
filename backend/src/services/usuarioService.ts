import { NivelUsuario } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";
import { hashSenha } from "../utils/hash";
import { registrarHistorico } from "./historicoService";

export async function listarUsuarios() {
  return prisma.usuario.findMany({
    select: { id: true, nome: true, login: true, nivel: true, ativo: true, criadoEm: true },
    orderBy: { nome: "asc" },
  });
}

export async function criarUsuario(
  dados: { nome: string; login: string; senha: string; nivel: NivelUsuario },
  usuarioIdCriador: string
) {
  const existente = await prisma.usuario.findUnique({ where: { login: dados.login } });
  if (existente) {
    throw new AppError("Ja existe um usuario com este login", 409);
  }

  const senhaHash = await hashSenha(dados.senha);
  const usuario = await prisma.usuario.create({
    data: { nome: dados.nome, login: dados.login, senhaHash, nivel: dados.nivel },
  });

  await registrarHistorico({
    usuarioId: usuarioIdCriador,
    acao: "CRIACAO_USUARIO",
    detalhes: `Usuario ${usuario.login} criado com nivel ${usuario.nivel}`,
  });

  return { id: usuario.id, nome: usuario.nome, login: usuario.login, nivel: usuario.nivel };
}

export async function atualizarUsuario(
  id: string,
  dados: Partial<{ nome: string; senha: string; nivel: NivelUsuario; ativo: boolean }>,
  usuarioIdEditor: string
) {
  const usuario = await prisma.usuario.findUnique({ where: { id } });
  if (!usuario) {
    throw new AppError("Usuario nao encontrado", 404);
  }

  const data: { nome?: string; senhaHash?: string; nivel?: NivelUsuario; ativo?: boolean } = {
    nome: dados.nome,
    nivel: dados.nivel,
    ativo: dados.ativo,
  };
  if (dados.senha) {
    data.senhaHash = await hashSenha(dados.senha);
  }

  const atualizado = await prisma.usuario.update({ where: { id }, data });

  await registrarHistorico({
    usuarioId: usuarioIdEditor,
    acao: "ATUALIZACAO_USUARIO",
    detalhes: `Usuario ${atualizado.login} atualizado`,
  });

  return { id: atualizado.id, nome: atualizado.nome, login: atualizado.login, nivel: atualizado.nivel, ativo: atualizado.ativo };
}
