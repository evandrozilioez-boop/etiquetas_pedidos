"use client";
import { useState } from "react";

export function LoginForm() {
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: f.get("email"), password: f.get("password") }),
      });
      if (r.ok) window.location.href = "/admin";
      else setErr((await r.json().catch(() => null))?.error ?? "Não foi possível entrar.");
    } catch {
      setErr("Sem conexão com o servidor.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel" onSubmit={submit}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/giro360-logo.png" alt="Giro 360" style={{ height: 90, justifySelf: "center", background: "#fff", borderRadius: 16, padding: 6 }} />
      <h1 style={{ fontSize: 22, textAlign: "center" }}>Painel de operação</h1>
      <div className="field">
        <label htmlFor="email">E-mail</label>
        <input id="email" name="email" type="email" autoComplete="username" required />
      </div>
      <div className="field">
        <label htmlFor="password">Senha</label>
        <input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {err && <div className="error">{err}</div>}
      <button className="btn primary" disabled={busy}>
        {busy ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
