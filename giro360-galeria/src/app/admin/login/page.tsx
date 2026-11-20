import type { Metadata } from "next";
import { LoginForm } from "@/components/admin/LoginForm";

export const metadata: Metadata = { title: "Entrar no painel" };

export default function Login() {
  return (
    <div className="login">
      <LoginForm />
    </div>
  );
}
