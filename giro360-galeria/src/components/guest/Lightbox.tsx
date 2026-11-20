"use client";
import { useEffect } from "react";
import { fmtBytes, fmtDuration } from "@/lib/format";

export type GuestItem = {
  id: string;
  kind: "photo" | "video";
  durationSec: number | null;
  sizeBytes: number;
  thumbUrl: string | null;
  previewUrl: string | null;
  posterUrl: string | null;
};

/** Visualização ampliada: usa a prévia leve; o original só é baixado ao tocar em "Baixar original". */
export function Lightbox({
  items,
  index,
  onIndex,
  onClose,
  downloadHref,
  note,
}: {
  items: GuestItem[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  downloadHref?: (m: GuestItem) => string;
  note?: string;
}) {
  const m = items[index];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onIndex((index + 1) % items.length);
      if (e.key === "ArrowLeft") onIndex((index - 1 + items.length) % items.length);
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [index, items.length, onClose, onIndex]);
  if (!m) return null;
  return (
    <div className="lb" role="dialog" aria-modal="true" aria-label="Visualização ampliada">
      <div className="lb-top">
        <span>
          {index + 1} de {items.length}
          {m.kind === "video" && m.durationSec ? ` · vídeo ${fmtDuration(m.durationSec)}` : ""}
        </span>
        <button className="round" onClick={onClose} aria-label="Fechar">
          ✕
        </button>
      </div>
      <div className="lb-stage">
        {m.kind === "video" ? (
          <video key={m.id} src={m.previewUrl ?? undefined} poster={m.posterUrl ?? undefined} controls playsInline preload="metadata" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={m.id} src={m.previewUrl ?? m.thumbUrl ?? ""} alt="" />
        )}
        {items.length > 1 && (
          <>
            <button className="round lb-nav" style={{ left: 0 }} onClick={() => onIndex((index - 1 + items.length) % items.length)} aria-label="Anterior">
              ‹
            </button>
            <button className="round lb-nav" style={{ right: 0 }} onClick={() => onIndex((index + 1) % items.length)} aria-label="Próximo">
              ›
            </button>
          </>
        )}
      </div>
      <div className="lb-bottom">
        {downloadHref ? (
          <>
            <a className="btn primary big" href={downloadHref(m)}>
              Baixar original
            </a>
            <small>
              {m.kind === "video" ? "Vídeo completo" : "Foto em resolução máxima"} · {fmtBytes(m.sizeBytes)}
              {m.kind === "video" ? " · no iPhone, abra o arquivo baixado e toque em Compartilhar › Salvar vídeo" : ""}
            </small>
          </>
        ) : (
          <small>{note}</small>
        )}
      </div>
    </div>
  );
}

export function Tile({ m, onClick, label }: { m: GuestItem; onClick: () => void; label: string }) {
  return (
    <button className="tile" onClick={onClick} aria-label={label}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {m.thumbUrl ? <img src={m.thumbUrl} alt="" loading="lazy" /> : null}
      {m.kind === "video" && <span className="badge">▶ {fmtDuration(m.durationSec)}</span>}
    </button>
  );
}
