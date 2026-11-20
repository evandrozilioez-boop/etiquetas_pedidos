"use client";
import { useState } from "react";
import Link from "next/link";
import { Uploader, type Limits } from "./Uploader";

export function QuickUpload({ events, initial, limits }: { events: { id: string; name: string; date: string }[]; initial: string | null; limits: Limits }) {
  const [eventId, setEventId] = useState(initial);
  if (!events.length) {
    return (
      <div className="panel">
        <p>Crie um evento antes de enviar arquivos.</p>
        <Link className="btn primary" href="/admin/eventos/novo" style={{ width: "fit-content" }}>
          Criar evento
        </Link>
      </div>
    );
  }
  return (
    <div className="panel">
      <div className="field">
        <label htmlFor="q-ev">Evento</label>
        <select id="q-ev" value={eventId ?? ""} onChange={(e) => setEventId(e.target.value)}>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} ({e.date.split("-").reverse().join("/")})
            </option>
          ))}
        </select>
      </div>
      {eventId && <Uploader key={eventId} eventId={eventId} limits={limits} />}
    </div>
  );
}
