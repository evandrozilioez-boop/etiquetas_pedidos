"use client";
import { useState } from "react";

/** Aviso curto no rodapé da tela. */
export function toast(message: string) {
  const el = document.createElement("div");
  el.className = "toast";
  el.setAttribute("role", "status");
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

export function Confirm(props: {
  title: string;
  text: string;
  label: string;
  danger?: boolean;
  eventName?: string;
  input?: { label: string; placeholder?: string; required?: boolean };
  onCancel: () => void;
  onConfirm: (typed: string) => Promise<void> | void;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const needsName = !!props.eventName;
  const disabled = busy || (needsName && typed.trim() !== props.eventName) || (!!props.input?.required && !typed.trim());
  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={props.title}>
      <div className="box">
        <h2 style={{ fontSize: 19 }}>{props.title}</h2>
        <p className="muted">{props.text}</p>
        {(needsName || props.input) && (
          <div className="field">
            <label htmlFor="confirm-input">{needsName ? `Digite: ${props.eventName}` : props.input!.label}</label>
            <input id="confirm-input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={props.input?.placeholder} autoFocus />
          </div>
        )}
        <div className="row">
          <button
            className={`btn ${props.danger ? "danger" : "primary"}`}
            disabled={disabled}
            onClick={async () => {
              setBusy(true);
              try {
                await props.onConfirm(typed);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Aguarde…" : props.label}
          </button>
          <button className="btn" onClick={props.onCancel}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
