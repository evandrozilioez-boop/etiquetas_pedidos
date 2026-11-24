"use client";
import { useCallback, useEffect, useState } from "react";
import { Confirm, toast } from "./ui";
import { fmtBytes, fmtDuration } from "@/lib/format";
import { downloadQrPng, svgDataUrl } from "./qr-png";

type M = {
  id: string;
  kind: "photo" | "video";
  filename: string;
  sizeBytes: number;
  status: string;
  error: string | null;
  duplicateOf: string | null;
  published: boolean;
  consentStatus: "pending" | "granted_all" | "denied";
  imageUse: boolean;
  highlight: boolean;
  faceStatus: string;
  faceCount: number;
  durationSec: number | null;
  createdAt: string;
  thumbUrl: string | null;
};

const ST: Record<string, [string, string]> = {
  uploading: ["Enviando", "p-info"],
  received: ["Recebido", "p-info"],
  processing: ["Processando", "p-warn"],
  ready: ["Disponível", "p-ok"],
  failed: ["Falhou", "p-bad"],
  duplicate: ["Duplicata", "p-mute"],
};
const FACE: Record<string, [string, string]> = {
  off: ["Fora da busca", "p-mute"],
  queued: ["Na fila da IA", "p-warn"],
  indexing: ["Indexando", "p-warn"],
  indexed: ["Na busca", "p-ok"],
  no_faces: ["Sem rostos", "p-mute"],
  failed: ["IA falhou", "p-bad"],
};
const FILTERS: [string, string][] = [
  ["", "Todas"],
  ["photo", "Fotos"],
  ["video", "Vídeos"],
  ["highlight", "Destaques"],
  ["consent_pending", "Sem autorização"],
  ["processing", "Processando"],
  ["failed", "Com falha"],
  ["unpublished", "Despublicadas"],
];

type Pending = { action: string; title: string; text: string; label: string; danger?: boolean; input?: { label: string; placeholder?: string; required?: boolean } };

export function MediaManager({ eventId }: { eventId: string }) {
  const [filter, setFilter] = useState("");
  const [items, setItems] = useState<M[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Pending | null>(null);
  const [share, setShare] = useState<null | { mediaId: string; url?: string; qr?: string; linkId?: string; error?: string }>(null);
  const [view, setView] = useState<M | null>(null);
  const base = `/api/admin/events/${eventId}`;

  const load = useCallback(
    async (cursor: string | null = null) => {
      setLoading(true);
      try {
        const r = await fetch(`${base}/media?limit=48${filter ? `&filter=${filter}` : ""}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
        const j = await r.json();
        setItems((prev) => (cursor ? [...prev, ...j.items] : j.items));
        setNext(j.nextCursor);
      } finally {
        setLoading(false);
      }
    },
    [base, filter],
  );
  useEffect(() => {
    setSel(new Set());
    void load();
  }, [load]);

  async function run(action: string, ids: string[], note?: string) {
    const r = await fetch(`${base}/media/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, mediaIds: ids, note }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) toast(j.error ?? "Não foi possível concluir.");
    else toast("Pronto.");
    setSel(new Set());
    await load();
  }

  async function openShare(m: M) {
    setShare({ mediaId: m.id });
    const r = await fetch(`/api/admin/media/${m.id}/share`, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    setShare(r.ok ? { mediaId: m.id, url: j.url, qr: j.qr, linkId: j.id } : { mediaId: m.id, error: j.error ?? "Não foi possível gerar o QR." });
  }

  const ids = [...sel];
  const bulk: Record<string, Pending> = {
    consent_grant: {
      action: "consent_grant",
      title: "Registrar autorização de busca facial",
      text: "Confirme que TODOS os participantes que aparecem nestas capturas autorizaram a busca facial antes da captura. Em caso de dúvida, não confirme: o arquivo continua disponível por QR individual.",
      label: "Confirmar autorização",
      input: { label: "Como a autorização foi registrada", placeholder: "Ex.: termo assinado no totem, sessões 10 a 14", required: true },
    },
    image_use_grant: {
      action: "image_use_grant",
      title: "Registrar autorização de uso de imagem",
      text: "Confirme que todas as pessoas destas capturas (e o cliente contratante, se for evento corporativo) autorizaram o uso para divulgação no site e redes da Giro 360. É separada da busca facial.",
      label: "Registrar autorização",
      input: { label: "Como a autorização foi registrada", placeholder: "Ex.: termo de uso de imagem v1, assinado no estande", required: true },
    },
    unpublish: {
      action: "unpublish",
      title: "Despublicar?",
      text: "Os arquivos saem da galeria, dos QRs individuais, dos destaques e das buscas. Os dados faciais deles são apagados. Dá para publicar de novo depois.",
      label: "Despublicar",
    },
    delete: {
      action: "delete",
      title: "Excluir definitivamente?",
      text: "Apaga o original, as prévias, os links e os dados faciais. Use para pedidos de remoção. Não pode ser desfeito.",
      label: "Excluir",
      danger: true,
    },
  };

  return (
    <div className="panel">
      <div className="row">
        <h2 className="grow">Mídias e destaques</h2>
        <button className="btn sm" onClick={() => run("retry", [])}>
          Tentar novamente os que falharam
        </button>
      </div>
      <div className="seg">
        {FILTERS.map(([k, l]) => (
          <button key={k || "all"} aria-pressed={filter === k} onClick={() => setFilter(k)}>
            {l}
          </button>
        ))}
      </div>
      <p className="small muted">
        Destaques aparecem no portfólio e na capa da galeria, mesmo com o download bloqueado. Para destacar, registre antes a autorização de uso de imagem.
        Toque nas caixas para selecionar vários.
      </p>
      {items.length === 0 && !loading && <p className="muted">Nenhum arquivo neste filtro.</p>}
      <div className="mgrid">
        {items.map((m) => {
          const [sl, sc] = m.published ? (ST[m.status] ?? [m.status, "p-mute"]) : ["Despublicada", "p-mute"];
          const [fl, fc] = FACE[m.faceStatus] ?? [m.faceStatus, "p-mute"];
          const checked = sel.has(m.id);
          return (
            <div className={`mcard ${checked ? "sel" : ""}`} key={m.id}>
              <div className="mthumb">
                <button style={{ all: "unset", display: "block", width: "100%", height: "100%", cursor: "pointer" }} onClick={() => setView(m)} aria-label={`Ver ${m.filename}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {m.thumbUrl ? <img src={m.thumbUrl} alt="" loading="lazy" /> : null}
                </button>
                <input
                  className="pick"
                  type="checkbox"
                  aria-label={`Selecionar ${m.filename}`}
                  checked={checked}
                  onChange={(e) => {
                    const s = new Set(sel);
                    if (e.target.checked) s.add(m.id);
                    else s.delete(m.id);
                    setSel(s);
                  }}
                />
                {m.kind === "video" && <span className="badge">▶ {fmtDuration(m.durationSec)}</span>}
              </div>
              <div className="mbody">
                <span className="nm" title={m.filename}>
                  {m.filename}
                </span>
                <span className="muted">{fmtBytes(m.sizeBytes)}</span>
                <div className="pills">
                  <span className={`pill ${sc}`}>{sl}</span>
                  <span className={`pill ${fc}`}>{fl}</span>
                  {m.highlight ? <span className="pill p-ok">Destaque</span> : m.imageUse ? <span className="pill p-info">Uso de imagem ok</span> : null}
                </div>
                {m.consentStatus !== "granted_all" && <span className="muted">Sem autorização de busca facial</span>}
                {m.error && <span style={{ color: "var(--bad)" }}>{m.error}</span>}
                <div className="row" style={{ gap: 6 }}>
                  {m.published && m.status !== "failed" && m.status !== "duplicate" && m.status !== "uploading" && (
                    <button className="btn sm" onClick={() => openShare(m)}>
                      QR individual
                    </button>
                  )}
                  {m.imageUse && m.published && m.status === "ready" && (
                    <button className="btn sm" onClick={() => run(m.highlight ? "unhighlight" : "highlight", [m.id])}>
                      {m.highlight ? "Tirar destaque" : "Destacar"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {next && (
        <button className="btn" onClick={() => load(next)} disabled={loading}>
          {loading ? "Carregando…" : "Carregar mais"}
        </button>
      )}

      {ids.length > 0 && (
        <div className="bulk">
          <b>{ids.length} selecionado(s)</b>
          <button className="btn sm" onClick={() => setPending(bulk.consent_grant)}>
            Autorizar busca facial
          </button>
          <button className="btn sm" onClick={() => run("consent_revoke", ids)}>
            Retirar autorização facial
          </button>
          <button className="btn sm" onClick={() => setPending(bulk.image_use_grant)}>
            Autorizar uso de imagem
          </button>
          <button className="btn sm" onClick={() => run("highlight", ids)}>
            Destacar
          </button>
          <button className="btn sm" onClick={() => run("unhighlight", ids)}>
            Tirar destaque
          </button>
          <button className="btn sm" onClick={() => run("publish", ids)}>
            Publicar
          </button>
          <button className="btn sm" onClick={() => setPending(bulk.unpublish)}>
            Despublicar
          </button>
          <button className="btn sm danger" onClick={() => setPending(bulk.delete)}>
            Excluir
          </button>
          <button className="btn sm ghost" onClick={() => setSel(new Set())}>
            Limpar seleção
          </button>
        </div>
      )}

      {pending && (
        <Confirm
          {...pending}
          onCancel={() => setPending(null)}
          onConfirm={async (typed) => {
            setPending(null);
            await run(pending.action, ids, typed || undefined);
          }}
        />
      )}

      {share && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="QR individual">
          <div className="box qrbox">
            <h2 style={{ fontSize: 19 }}>QR individual</h2>
            <p className="muted">Abre só este arquivo, sem selfie e sem depender do reconhecimento facial. Segue o prazo de download do evento e pode ser revogado.</p>
            {share.error ? (
              <div className="error">{share.error}</div>
            ) : share.qr ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="qr" src={svgDataUrl(share.qr)} alt="QR Code individual" />
                <div className="linkline">
                  <code>{share.url}</code>
                  <button className="btn sm" onClick={() => navigator.clipboard.writeText(share.url!).then(() => toast("Link copiado."), () => toast("Selecione o link para copiar."))}>
                    Copiar
                  </button>
                </div>
                <div className="row" style={{ justifyContent: "center" }}>
                  <button className="btn primary" onClick={() => downloadQrPng(share.qr!, "qr-individual.png", 720)}>
                    Baixar PNG
                  </button>
                  <a className="btn" href={share.url} target="_blank" rel="noopener">
                    Abrir
                  </a>
                  <a className="btn" href={`https://wa.me/?text=${encodeURIComponent(`Seu registro da Giro 360: ${share.url}`)}`} target="_blank" rel="noopener">
                    WhatsApp
                  </a>
                  <button
                    className="btn danger"
                    onClick={async () => {
                      await fetch(`/api/admin/media/${share.mediaId}/share`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ linkId: share.linkId }) });
                      toast("Link revogado.");
                      setShare(null);
                    }}
                  >
                    Revogar
                  </button>
                </div>
                <small className="muted">O link aparece só agora; guardamos apenas uma versão cifrada. Para mostrar de novo, gere outro.</small>
              </>
            ) : (
              <p>Gerando…</p>
            )}
            <button className="btn" onClick={() => setShare(null)}>
              Fechar
            </button>
          </div>
        </div>
      )}

      {view && (
        <div className="lb" role="dialog" aria-modal="true" aria-label={view.filename}>
          <div className="lb-top">
            <span>{view.filename}</span>
            <button className="round" onClick={() => setView(null)} aria-label="Fechar">
              ✕
            </button>
          </div>
          <div className="lb-stage">
            {view.status !== "ready" ? (
              <p>Prévia ainda não disponível ({ST[view.status]?.[0] ?? view.status}).</p>
            ) : view.kind === "video" ? (
              <video src={`/api/admin/media/${view.id}/download?v=preview`} controls playsInline />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/admin/media/${view.id}/download?v=preview`} alt="" />
            )}
          </div>
          <div className="lb-bottom">
            <a className="btn primary" href={`/api/admin/media/${view.id}/download`}>
              Baixar original
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
