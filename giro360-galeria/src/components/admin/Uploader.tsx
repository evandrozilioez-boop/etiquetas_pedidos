"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { contentTypeOf, fingerprintFile, uploadFile, UploadError, api } from "./upload-engine";
import { fmtBytes } from "@/lib/format";

type ItemState = "hashing" | "queued" | "uploading" | "processing" | "ready" | "failed" | "duplicate" | "rejected" | "needs_file";
type Item = {
  key: string;
  file?: File;
  name: string;
  size: number;
  kind: "photo" | "video";
  contentType: string | null;
  state: ItemState;
  sent: number;
  note?: string;
  mediaId?: string;
  partsDone?: number;
  totalParts?: number;
  serverFailed?: boolean;
};

export type Limits = { photoMaxMb: number; videoMaxMb: number; partMb: number; acceptedLabel: string };

const LABEL: Record<ItemState, [string, string]> = {
  hashing: ["Preparando", "p-mute"],
  queued: ["Na fila", "p-mute"],
  uploading: ["Enviando", "p-info"],
  processing: ["Processando", "p-warn"],
  ready: ["Disponível", "p-ok"],
  failed: ["Falhou", "p-bad"],
  duplicate: ["Já enviado", "p-mute"],
  rejected: ["Não aceito", "p-bad"],
  needs_file: ["Selecione de novo", "p-warn"],
};

const storeKey = (eventId: string) => `g360-uploads-${eventId}`;
function saveUnfinished(eventId: string, items: Item[]) {
  try {
    const keep = items
      .filter((i) => ["queued", "uploading", "failed", "needs_file"].includes(i.state) && i.contentType)
      .map(({ key, name, size, kind, contentType, mediaId, partsDone, totalParts }) => ({ key, name, size, kind, contentType, mediaId, partsDone, totalParts }));
    if (keep.length) localStorage.setItem(storeKey(eventId), JSON.stringify(keep));
    else localStorage.removeItem(storeKey(eventId));
  } catch {
    /* armazenamento local indisponível: segue sem lembrar */
  }
}

/**
 * Envio de fotos e vídeos (computador, iPad e iPhone). Mostra a situação real de cada arquivo:
 * enviando → recebido/processando → disponível (ou falhou), com "Tentar novamente" só para os que falharam.
 */
export function Uploader({ eventId, limits, onChange }: { eventId: string; limits: Limits; onChange?: () => void }) {
  const [items, setItems] = useState<Item[]>([]);
  const [consent, setConsent] = useState(false);
  const [wake, setWake] = useState<{ on: boolean; msg?: string }>({ on: false });
  const [over, setOver] = useState(false);
  const itemsRef = useRef<Item[]>([]);
  const active = useRef(0);
  const ctrl = useRef(new AbortController());
  const wakeRef = useRef<any>(null);
  const base = `/api/admin/events/${eventId}`;

  const update = useCallback(
    (key: string, patch: Partial<Item>) => {
      setItems((prev) => {
        const next = prev.map((i) => (i.key === key ? { ...i, ...patch } : i));
        itemsRef.current = next;
        saveUnfinished(eventId, next);
        return next;
      });
    },
    [eventId],
  );

  // Retomada após recarregar a página: o navegador não guarda o arquivo, então pedimos para selecionar de novo.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey(eventId)) ?? "[]") as Item[];
      if (saved.length) {
        const restored = saved.map((s) => ({ ...s, state: "needs_file" as const, sent: 0, note: s.partsDone ? `${s.partsDone} de ${s.totalParts} partes já confirmadas` : "envio interrompido" }));
        itemsRef.current = restored;
        setItems(restored);
      }
    } catch {
      /* ignora */
    }
  }, [eventId]);

  const pump = useCallback(() => {
    const MAX = 2;
    while (active.current < MAX) {
      const next = itemsRef.current.find((i) => i.state === "queued" && i.file);
      if (!next) break;
      active.current++;
      next.state = "uploading";
      update(next.key, { state: "uploading", note: undefined });
      void (async () => {
        try {
          const r = await uploadFile(
            base,
            next.file!,
            { fingerprint: next.key, contentType: next.contentType!, consentGrantedAll: consent },
            (p) => update(next.key, { mediaId: p.mediaId, sent: p.sent, partsDone: p.partsDone, totalParts: p.totalParts, note: p.note }),
            ctrl.current.signal,
          );
          const st: ItemState = r.status === "ready" ? "ready" : r.status === "duplicate" ? "duplicate" : "processing";
          update(next.key, {
            state: st,
            mediaId: r.mediaId,
            sent: next.size,
            note: st === "duplicate" ? "Este arquivo já estava no evento; nada foi enviado de novo." : st === "processing" ? "recebido, gerando prévia" : undefined,
          });
          onChange?.();
        } catch (e) {
          const err = e as UploadError;
          const confirmed = itemsRef.current.find((i) => i.key === next.key);
          update(next.key, {
            state: err.retryable === false ? "rejected" : "failed",
            note:
              err.retryable === false
                ? err.message
                : `${err.message}${confirmed?.partsDone ? ` ${confirmed.partsDone} de ${confirmed.totalParts} partes confirmadas e preservadas.` : ""}`,
          });
        } finally {
          active.current--;
          pump();
        }
      })();
    }
  }, [base, consent, onChange, update]);

  async function addFiles(list: FileList | File[]) {
    const files = Array.from(list).filter((f) => !f.name.startsWith("."));
    const fresh: Item[] = [];
    for (const f of files) {
      const contentType = contentTypeOf(f);
      const kind = contentType?.startsWith("video") ? "video" : "photo";
      const maxMb = kind === "video" ? limits.videoMaxMb : limits.photoMaxMb;
      const tmpKey = `tmp-${f.name}-${f.size}-${f.lastModified}-${Math.random()}`;
      if (!contentType) {
        fresh.push({ key: tmpKey, name: f.name, size: f.size, kind, contentType, state: "rejected", sent: 0, note: `Formato não aceito. Use ${limits.acceptedLabel}.` });
        continue;
      }
      if (f.size > maxMb * 1024 * 1024) {
        fresh.push({ key: tmpKey, name: f.name, size: f.size, kind, contentType, state: "rejected", sent: 0, note: `Acima do limite de ${maxMb} MB.` });
        continue;
      }
      fresh.push({ key: tmpKey, file: f, name: f.name, size: f.size, kind, contentType, state: "hashing", sent: 0 });
    }
    itemsRef.current = [...fresh, ...itemsRef.current];
    setItems(itemsRef.current);
    for (const it of fresh.filter((i) => i.state === "hashing")) {
      const fp = await fingerprintFile(it.file!);
      const existing = itemsRef.current.find((i) => i.key === fp);
      if (existing && existing.state !== "needs_file" && existing.state !== "failed") {
        // mesmo arquivo selecionado duas vezes: mantém um só
        itemsRef.current = itemsRef.current.filter((i) => i.key !== it.key);
        setItems(itemsRef.current);
        continue;
      }
      itemsRef.current = itemsRef.current
        .filter((i) => !(i.key === fp && i !== it))
        .map((i) => (i.key === it.key ? { ...i, key: fp, state: "queued" as const, note: existing?.partsDone ? `retomando: ${existing.partsDone} de ${existing.totalParts} partes já confirmadas` : undefined } : i));
      setItems(itemsRef.current);
    }
    saveUnfinished(eventId, itemsRef.current);
    pump();
  }

  // Acompanha o processamento no servidor até cada arquivo ficar disponível.
  useEffect(() => {
    const t = setInterval(async () => {
      const waiting = itemsRef.current.filter((i) => i.state === "processing" && i.mediaId);
      if (!waiting.length) return;
      try {
        const r = await api<{ items: { id: string; status: string; error: string | null; faceStatus: string }[] }>(
          `${base}/media?ids=${waiting.map((w) => w.mediaId).join(",")}&limit=100`,
        );
        for (const m of r.items) {
          const it = itemsRef.current.find((i) => i.mediaId === m.id);
          if (!it) continue;
          if (m.status === "ready") update(it.key, { state: "ready", note: m.faceStatus === "queued" || m.faceStatus === "indexing" ? "disponível; entrando na busca facial" : undefined });
          else if (m.status === "failed") update(it.key, { state: "failed", serverFailed: true, note: m.error ?? "Falha no processamento." });
          else if (m.status === "duplicate") update(it.key, { state: "duplicate", note: "Conteúdo idêntico a um arquivo já enviado; guardamos um só." });
        }
        onChange?.();
      } catch {
        /* tenta no próximo ciclo */
      }
    }, 4000);
    return () => clearInterval(t);
  }, [base, onChange, update]);

  // iPhone/iPad: ao voltar para a tela ou a conexão voltar, retoma sozinho o que falhou por rede.
  useEffect(() => {
    const resume = () => {
      if (document.visibilityState !== "visible") return;
      let changed = false;
      for (const i of itemsRef.current) {
        if (i.state === "failed" && i.file && !i.serverFailed) {
          i.state = "queued";
          changed = true;
        }
      }
      if (changed) {
        setItems([...itemsRef.current]);
        pump();
      }
      if (wakeRef.current?.released && wake.on) void requestWake();
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => {
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
    };
  });

  async function retryFailed() {
    const serverSide = itemsRef.current.filter((i) => i.state === "failed" && i.serverFailed && i.mediaId);
    if (serverSide.length) {
      await api(`${base}/media/actions`, { action: "retry", mediaIds: serverSide.map((i) => i.mediaId) }).catch(() => undefined);
      for (const i of serverSide) update(i.key, { state: "processing", serverFailed: false, note: "reprocessando" });
    }
    for (const i of itemsRef.current) if (i.state === "failed" && !i.serverFailed && i.file) i.state = "queued";
    setItems([...itemsRef.current]);
    pump();
  }

  async function requestWake() {
    try {
      wakeRef.current = await (navigator as any).wakeLock.request("screen");
      setWake({ on: true, msg: "Ligado: a tela não vai apagar enquanto esta página estiver aberta." });
    } catch {
      setWake({ on: false, msg: "Este navegador não permitiu. No iPhone, ajuste Ajustes › Tela e Brilho › Bloqueio Automático para “Nunca” durante o envio." });
    }
  }

  const c = (s: ItemState) => items.filter((i) => i.state === s).length;
  const busy = c("uploading") + c("queued") + c("hashing");
  const remaining = items.filter((i) => ["queued", "uploading", "hashing"].includes(i.state)).reduce((a, i) => a + Math.max(0, i.size - i.sent), 0);

  return (
    <div className="stack">
      <div
        className={`drop ${over ? "over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void addFiles(e.dataTransfer.files);
        }}
      >
        <b>Arraste uma pasta ou arquivos aqui</b>
        <small className="muted">
          Aceitos: fotos JPEG e PNG até {limits.photoMaxMb} MB · vídeos MP4 e MOV até {Math.round(limits.videoMaxMb / 1024)} GB. Arquivos grandes vão em partes de{" "}
          {limits.partMb} MB e retomam de onde pararam.
        </small>
        <div className="row" style={{ justifyContent: "center" }}>
          <label className="btn primary">
            Selecionar arquivos
            <input type="file" multiple hidden accept="image/jpeg,image/png,video/mp4,video/quicktime,.mov,.mp4,.jpg,.jpeg,.png" onChange={(e) => (e.target.files && addFiles(e.target.files), (e.target.value = ""))} />
          </label>
          <label className="btn">
            Selecionar pasta
            <input
              type="file"
              hidden
              // @ts-expect-error atributo não padronizado, suportado pelos navegadores de computador
              webkitdirectory=""
              onChange={(e) => (e.target.files && addFiles(e.target.files), (e.target.value = ""))}
            />
          </label>
        </div>
      </div>

      <label className="toggle">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>
          <b>Todos os participantes destas capturas autorizaram a busca facial</b>
          <small>
            Marque só se a autorização foi registrada antes da captura. Na dúvida, deixe desmarcado: o arquivo fica disponível por QR individual, sem
            biometria. Vale para os próximos arquivos adicionados.
          </small>
        </span>
      </label>
      <label className="toggle">
        <input type="checkbox" checked={wake.on} onChange={(e) => (e.target.checked ? requestWake() : (wakeRef.current?.release?.(), setWake({ on: false })))} />
        <span>
          <b>Manter a tela ligada durante o envio</b>
          <small>{wake.msg ?? "No iPhone, o envio pausa se a tela bloquear ou você trocar de app. Ao voltar, ele continua da última parte confirmada."}</small>
        </span>
      </label>

      {items.length > 0 && (
        <>
          <div className="sumline">
            <div>
              <b>
                {c("ready") + c("duplicate")} de {items.filter((i) => i.state !== "rejected").length}
              </b>
              <span>concluídos</span>
            </div>
            <div>
              <b>{busy + c("processing")}</b>
              <span>em andamento</span>
            </div>
            <div>
              <b>{fmtBytes(remaining)}</b>
              <span>falta enviar</span>
            </div>
          </div>
          {busy > 0 && (
            <div className="okmsg" style={{ background: "var(--warn-soft)", color: "var(--fg)" }}>
              <b>Deixe esta tela aberta até o envio terminar.</b> Se a conexão cair, o envio continua sozinho quando ela voltar.
            </div>
          )}
          <div className="row">
            <h2 className="grow" style={{ fontSize: 18 }}>
              Fila de envio
            </h2>
            {(c("failed") > 0) && (
              <button className="btn sm" onClick={retryFailed}>
                Tentar novamente os que falharam ({c("failed")})
              </button>
            )}
            {busy === 0 && (
              <button
                className="btn sm ghost"
                onClick={() => {
                  itemsRef.current = itemsRef.current.filter((i) => !["ready", "duplicate", "rejected"].includes(i.state));
                  setItems(itemsRef.current);
                  saveUnfinished(eventId, itemsRef.current);
                }}
              >
                Limpar concluídos
              </button>
            )}
          </div>
          {c("needs_file") > 0 && (
            <div className="okmsg" style={{ background: "var(--info-soft)", color: "var(--info)" }}>
              Alguns envios foram interrompidos quando a página fechou. O progresso confirmado está guardado: selecione os mesmos arquivos de novo para
              continuar de onde parou.
            </div>
          )}
          <div className="uplist">
            {items.map((i) => {
              const [label, cls] = LABEL[i.state];
              const pct = ["ready", "processing", "duplicate"].includes(i.state) ? 100 : Math.round((i.sent / Math.max(1, i.size)) * 100);
              return (
                <div className="up" key={i.key}>
                  <span className="nm">{i.name}</span>
                  <span className={`pill ${cls}`}>{label}</span>
                  <div className="bar">
                    <i style={{ width: `${pct}%` }} />
                  </div>
                  <span className="sub">
                    {i.kind === "video" ? "Vídeo" : "Foto"} · {fmtBytes(i.size)}
                    {i.totalParts && i.totalParts > 1 && i.state === "uploading" ? ` · parte ${Math.min(i.totalParts, (i.partsDone ?? 0) + 1)} de ${i.totalParts}` : ""}
                    {i.state === "uploading" ? ` · ${pct}%` : ""}
                    {i.note ? ` · ${i.note}` : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
