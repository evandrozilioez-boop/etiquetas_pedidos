import { api } from "./client";
import { Usuario } from "../types";

export interface LoginResponse {
  token: string;
  usuario: Usuario;
}

export async function login(login: string, senha: string): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>("/auth/login", { login, senha });
  return data;
}

export async function logout(): Promise<void> {
  await api.post("/auth/logout");
}
