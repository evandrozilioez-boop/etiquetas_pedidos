"use client";
import { useCallback, useEffect, useState } from "react";
import { toast } from "./ui";
import { fmtDateTime } from "@/lib/format";

type C = {
  id: string;
  participant_name: string;
  participant_contact: string | null;
  capture_ref: string | null;
  term_version: string;
  scope: "face" | "image_use" | "face_and_image_use";
  collected_by: string;
  collected_at: string;
  notes: string | null;
};
const SCOPE: Record<C["scope"], string> = {
  face: "Busca facial",
  image_use: "Uso de imagem (divulgação)",
  face_and_image_use: "Busca facial + uso de imagem",
};

/** Registro operacional das autorizações coletadas antes da captura. */
export function Consents({ eventId }: { eventId: string }) {
  const [list, setList] = useState<C[]>([]);
  const [busy, setBusy] = useState(false);
  const base = `/api/admin/events/${eventId}/consents`;
  const load = useCallback(async () => {
    const r = await fetch(base);
    if (r.ok) setList((await r.json()).consents);
  }, [base]);
  useEffect(() => {
    void load();
  }, [load]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    const r = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        participantName: f.get("name"),
        participantContact: f.get("contact") || null,
        captureRef: f.get("ref") || null,
        termVersion: f.get("term"),
        scope: f.get("scope"),
        notes: f.get("notes") || null,
      }),
    });
    setBusy(false);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return toast(j.error ?? "Não foi possível registrar.");
    form.reset();
    toast("Autorização registrada.");
    await load();
  }

  return (
    <div className="two">
      <div className="panel">
        <h2>Autorizações registradas</h2>
        <p className="muted small">
          Registre antes da captura. Em capturas de grupo, só marque a mídia como autorizada (em “Mídias e destaques”) quando todos os participantes tiverem
          autorizado.
        </p>
        {list.length === 0 ? (
          <p className="muted">Nenhuma autorização registrada neste evento.</p>
        ) : (
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Participante</th>
                  <th>Captura</th>
                  <th>Autorizou</th>
                  <th>Quando</th>
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {c.participant_name}
                      {c.participant_contact && <div className="small muted">{c.participant_contact}</div>}
                    </td>
                    <td>{c.capture_ref ?? "—"}</td>
                    <td>
                      {SCOPE[c.scope]}
                      <div className="small muted">termo {c.term_version}</div>
                    </td>
                    <td>
                      {fmtDateTime(c.collected_at)}
                      <div className="small muted">{c.collected_by}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <form className="panel" onSubmit={submit}>
        <h2>Nova autorização</h2>
        <div className="field">
          <label htmlFor="c-name">Nome do participante</label>
          <input id="c-name" name="name" required maxLength={160} />
        </div>
        <div className="field">
          <label htmlFor="c-contact">Contato (opcional)</label>
          <input id="c-contact" name="contact" maxLength={160} />
        </div>
        <div className="field">
          <label htmlFor="c-ref">Referência da captura</label>
          <input id="c-ref" name="ref" maxLength={160} placeholder="Ex.: Totem sessão 15, Plataforma take 07" />
        </div>
        <div className="field">
          <label htmlFor="c-scope">O que foi autorizado</label>
          <select id="c-scope" name="scope" defaultValue="face">
            <option value="face">Busca facial</option>
            <option value="image_use">Uso de imagem para divulgação</option>
            <option value="face_and_image_use">Busca facial + uso de imagem</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="c-term">Versão do termo</label>
          <input id="c-term" name="term" required defaultValue="v1" maxLength={60} />
          <small>Os textos dos termos precisam ser revisados pela Giro antes do uso com convidados reais.</small>
        </div>
        <div className="field">
          <label htmlFor="c-notes">Observações</label>
          <input id="c-notes" name="notes" maxLength={500} />
        </div>
        <button className="btn primary" disabled={busy}>
          Registrar
        </button>
      </form>
    </div>
  );
}
