import { api } from "./client";
import { NivelUsuario, Usuario } from "../types";

export async function listarUsuarios(): Promise<Usuario[]> {
  const { data } = await api.get<Usuario[]>("/usuarios");
  return data;
}

export async function criarUsuario(dados: {
  nome: string;
  login: string;
  senha: string;
  nivel: NivelUsuario;
}): Promise<Usuario> {
  const { data } = await api.post<Usuario>("/usuarios", dados);
  return data;
}

export async function atualizarUsuario(
  id: string,
  dados: Partial<{ nome: string; senha: string; nivel: NivelUsuario; ativo: boolean }>
): Promise<Usuario> {
  const { data } = await api.put<Usuario>(`/usuarios/${id}`, dados);
  return data;
}
