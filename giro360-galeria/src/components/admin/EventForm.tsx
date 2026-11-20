"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export type EventFormValues = {
  id?: string;
  name: string;
  eventDate: string;
  city: string;
  description: string;
  isPrivate: boolean;
  accessCode: string;
  allowFullBrowse: boolean;
  showInPortfolio: boolean;
};

const EMPTY: EventFormValues = {
  name: "",
  eventDate: new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10),
  city: "",
  description: "",
  isPrivate: true,
  accessCode: "",
  allowFullBrowse: false,
  showInPortfolio: false,
};

export function EventForm({ initial, accessDays, faceDays, onSaved }: { initial?: EventFormValues; accessDays: number; faceDays: number; onSaved?: () => void }) {
  const router = useRouter();
  const [v, setV] = useState<EventFormValues>(initial ?? EMPTY);
  const [cover, setCover] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof EventFormValues>(k: K, val: EventFormValues[K]) => setV((p) => ({ ...p, [k]: val }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const body = { ...v, accessCode: v.accessCode || null, description: v.description || null };
      const r = await fetch(v.id ? `/api/admin/events/${v.id}` : "/api/admin/events", {
        method: v.id ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Não foi possível salvar.");
      const id = j.event.id as string;
      if (cover) {
        const f = new FormData();
        f.set("file", cover);
        const c = await fetch(`/api/admin/events/${id}/cover`, { method: "POST", body: f });
        if (!c.ok) throw new Error((await c.json().catch(() => null))?.error ?? "Evento salvo, mas a capa não foi enviada. Tente de novo.");
      }
      if (onSaved) {
        onSaved();
        router.refresh();
      } else router.push(`/admin/eventos/${id}`);
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel" onSubmit={submit}>
      <div className="fgrid">
        <div className="field">
          <label htmlFor="ev-name">Nome do evento</label>
          <input id="ev-name" required maxLength={140} value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: Lançamento Verão 2027" />
        </div>
        <div className="field">
          <label htmlFor="ev-date">Data</label>
          <input id="ev-date" type="date" required value={v.eventDate} onChange={(e) => set("eventDate", e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="ev-city">Cidade</label>
          <input id="ev-city" required maxLength={80} value={v.city} onChange={(e) => set("city", e.target.value)} placeholder="Ex.: Florianópolis/SC" />
        </div>
        <div className="field">
          <label htmlFor="ev-code">Código de acesso</label>
          <input
            id="ev-code"
            maxLength={32}
            value={v.accessCode}
            onChange={(e) => set("accessCode", e.target.value.toUpperCase())}
            placeholder={v.isPrivate ? "Gerado automaticamente" : "Não usado em álbum público"}
            disabled={!v.isPrivate}
          />
        </div>
        <div className="field">
          <label htmlFor="ev-cover">Capa do evento</label>
          <input id="ev-cover" type="file" accept="image/jpeg,image/png" onChange={(e) => setCover(e.target.files?.[0] ?? null)} />
          <small>JPEG ou PNG, de preferência horizontal.</small>
        </div>
      </div>
      <div className="field">
        <label htmlFor="ev-desc">Descrição (opcional)</label>
        <input id="ev-desc" maxLength={500} value={v.description} onChange={(e) => set("description", e.target.value)} />
      </div>
      <p className="muted small">
        Prazos: download liberado por {accessDays} dias após o evento (pode ser estendido em blocos de 30 dias) e busca por selfie por {faceDays} dias. A
        galeria e os destaques nunca saem do ar.
      </p>
      <label className="toggle">
        <input type="checkbox" checked={v.isPrivate} onChange={(e) => set("isPrivate", e.target.checked)} />
        <span>
          <b>Álbum privado</b>
          <small>Exige o código de acesso antes da busca ou da navegação. Recomendado.</small>
        </span>
      </label>
      <label className="toggle">
        <input type="checkbox" checked={v.allowFullBrowse} onChange={(e) => set("allowFullBrowse", e.target.checked)} />
        <span>
          <b>Permitir navegar pelo álbum completo</b>
          <small>Desligado: o convidado vê só os resultados da própria busca ou do QR individual.</small>
        </span>
      </label>
      <label className="toggle">
        <input type="checkbox" checked={v.showInPortfolio} onChange={(e) => set("showInPortfolio", e.target.checked)} />
        <span>
          <b>Exibir no portfólio</b>
          <small>Mostra a capa e os destaques escolhidos. Só entram mídias com autorização de uso de imagem.</small>
        </span>
      </label>
      {err && <div className="error">{err}</div>}
      <div className="row">
        <button className="btn primary" disabled={busy}>
          {busy ? "Salvando…" : v.id ? "Salvar alterações" : "Criar evento"}
        </button>
      </div>
    </form>
  );
}
