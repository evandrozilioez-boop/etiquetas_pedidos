"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "./ui";

type V = { whatsapp: string; removalContact: string; portfolioTitle: string; portfolioText: string };

export function SettingsForm({ initial, logoUrl }: { initial: V; logoUrl: string | null }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/admin/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(v) });
    setBusy(false);
    if (!r.ok) return setErr((await r.json().catch(() => null))?.error ?? "Não foi possível salvar.");
    toast("Configurações salvas.");
    router.refresh();
  }
  async function uploadLogo(file: File) {
    const f = new FormData();
    f.set("file", file);
    const r = await fetch("/api/admin/settings/logo", { method: "POST", body: f });
    if (!r.ok) toast((await r.json().catch(() => null))?.error ?? "Não foi possível enviar a logo.");
    else toast("Logo atualizada.");
    router.refresh();
  }

  return (
    <form className="panel" onSubmit={save}>
      <h2>Identidade e atendimento</h2>
      <div className="field">
        <label htmlFor="s-logo">Logo</label>
        <div className="row">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl ?? "/brand/giro360-logo.png"} alt="Logo atual" style={{ width: 80, height: 80, objectFit: "contain", background: "#fff", border: "1px solid var(--line)", borderRadius: 12, padding: 6 }} />
          <input id="s-logo" type="file" accept="image/png,image/jpeg" className="grow" onChange={(e) => e.target.files?.[0] && uploadLogo(e.target.files[0])} />
        </div>
        <small>
          {logoUrl ? "Logo enviada em uso." : "Usando a logo oficial incluída no sistema."} Prefira PNG com fundo transparente.
          {logoUrl && (
            <>
              {" "}
              <button
                type="button"
                className="btn sm ghost"
                onClick={async () => {
                  await fetch("/api/admin/settings/logo", { method: "DELETE" });
                  router.refresh();
                }}
              >
                Voltar para a logo oficial
              </button>
            </>
          )}
        </small>
      </div>
      <div className="field">
        <label htmlFor="s-wa">WhatsApp para pedidos de liberação</label>
        <input id="s-wa" inputMode="tel" value={v.whatsapp} onChange={(e) => setV({ ...v, whatsapp: e.target.value })} placeholder="5548999990000" />
        <small>Com DDI e DDD, só números. Aparece no botão “Pedir liberação pelo WhatsApp” quando o prazo de download termina.</small>
      </div>
      <div className="field">
        <label htmlFor="s-rc">Canal para pedidos de remoção</label>
        <input id="s-rc" value={v.removalContact} onChange={(e) => setV({ ...v, removalContact: e.target.value })} />
        <small>E-mail ou telefone exibido no rodapé de todas as galerias.</small>
      </div>
      <div className="field">
        <label htmlFor="s-pt">Título do portfólio</label>
        <input id="s-pt" value={v.portfolioTitle} onChange={(e) => setV({ ...v, portfolioTitle: e.target.value })} />
      </div>
      <div className="field">
        <label htmlFor="s-px">Texto do portfólio</label>
        <input id="s-px" value={v.portfolioText} onChange={(e) => setV({ ...v, portfolioText: e.target.value })} />
      </div>
      {err && <div className="error">{err}</div>}
      <button className="btn primary" disabled={busy}>
        Salvar
      </button>
    </form>
  );
}
