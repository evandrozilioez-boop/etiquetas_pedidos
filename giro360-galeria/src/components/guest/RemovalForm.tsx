"use client";
import { useState } from "react";

export function RemovalForm({ eventToken }: { eventToken: string | null }) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [err, setErr] = useState<string | null>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setState("sending");
    setErr(null);
    const r = await fetch("/api/removal-request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventToken, name: f.get("name"), contact: f.get("contact"), message: f.get("message") }),
    }).catch(() => null);
    if (r?.ok) setState("sent");
    else {
      setErr((await r?.json().catch(() => null))?.error ?? "Não foi possível enviar. Tente de novo.");
      setState("idle");
    }
  }
  if (state === "sent") return <div className="notice n-ok">Pedido recebido. A equipe da Giro 360 vai responder pelo contato informado.</div>;
  return (
    <form onSubmit={submit} className="stack">
      <div className="field">
        <label htmlFor="rn">Seu nome</label>
        <input id="rn" name="name" required maxLength={160} style={{ background: "#0f0d14", borderColor: "var(--gallery-line)" }} />
      </div>
      <div className="field">
        <label htmlFor="rc">E-mail ou telefone para retorno</label>
        <input id="rc" name="contact" required maxLength={160} style={{ background: "#0f0d14", borderColor: "var(--gallery-line)" }} />
      </div>
      <div className="field">
        <label htmlFor="rm">O que deve ser removido</label>
        <textarea id="rm" name="message" required rows={4} maxLength={2000} placeholder="Evento, data e, se possível, o link ou a descrição da foto/vídeo." style={{ background: "#0f0d14", borderColor: "var(--gallery-line)" }} />
      </div>
      {err && <div className="notice n-bad">{err}</div>}
      <button className="btn primary" disabled={state === "sending"}>
        {state === "sending" ? "Enviando…" : "Enviar pedido"}
      </button>
    </form>
  );
}
