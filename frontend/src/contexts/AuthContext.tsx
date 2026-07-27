import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { getToken, setToken as persistToken } from "../api/client";
import * as authApi from "../api/auth";
import { Usuario } from "../types";

interface AuthContextValue {
  usuario: Usuario | null;
  carregando: boolean;
  entrar: (login: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const USER_KEY = "etiquetas_pedidos_usuario";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const token = getToken();
    const usuarioSalvo = localStorage.getItem(USER_KEY);
    if (token && usuarioSalvo) {
      setUsuario(JSON.parse(usuarioSalvo));
    }
    setCarregando(false);
  }, []);

  async function entrar(login: string, senha: string) {
    const resposta = await authApi.login(login, senha);
    persistToken(resposta.token);
    localStorage.setItem(USER_KEY, JSON.stringify(resposta.usuario));
    setUsuario(resposta.usuario);
  }

  async function sair() {
    try {
      await authApi.logout();
    } catch {
      // segue com o logout local mesmo se a chamada falhar
    }
    persistToken(null);
    localStorage.removeItem(USER_KEY);
    setUsuario(null);
  }

  return (
    <AuthContext.Provider value={{ usuario, carregando, entrar, sair }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de AuthProvider");
  return ctx;
}
