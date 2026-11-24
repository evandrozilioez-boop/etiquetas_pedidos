"use client";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Uploader, type Limits } from "./Uploader";
import { MediaManager } from "./MediaManager";
import { Consents } from "./Consents";
import { EventForm, type EventFormValues } from "./EventForm";
import { Confirm, toast } from "./ui";
import { fmtBytes } from "@/lib/format";
import { downloadQrPng, svgDataUrl } from "./qr-png";

type Tab = "overview" | "upload" | "media" | "consents" | "edit";
type Ev = {
  id: string;
  name: string;
  dateLong: string;
  city: string;
  publicUrl: string;
  accessCode: string | null;
  accessOpen: boolean;
  accessUntil: string;
  nextAccessUntil: string;
  faceEnabled: boolean;
  faceOpen: boolean;
  faceUntil: string;
  facePurged: boolean;
  facesAvailable: boolean;
  allowFullBrowse: boolean;
  showInPortfolio: boolean;
  isPrivate: boolean;
};
type Stats = {
  photos: number;
  videos: number;
  uploading: number;
  processing: number;
  failed: number;
  duplicates: number;
  unpublished: number;
  faceIndexed: number;
  facePending: number;
  consentGranted: number;
  highlights: number;
  storageBytes: number;
  aiUsage: { indexPhoto: number; indexVideoFrame: number; search: number; detectSelfie: number };
  searches: number;
};

export function EventAdmin(props: { initialTab: Tab; event: Ev; form: EventFormValues; stats: Stats; qr: string; limits: Limits; accessDays: number; faceDays: number }) {
  const { event: e, stats: s } = props;
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(props.initialTab);
  const [confirm, setConfirm] = useState<null | { title: string; text: string; label: string; run: () => Promise<void>; danger?: boolean; typeName?: boolean }>(null);
  const refresh = useCallback(() => router.refresh(), [router]);

  async function action(a: string, okMsg: string) {
    const r = await fetch(`/api/admin/events/${e.id}/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: a }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) toast(j.error ?? "Não foi possível concluir.");
    else toast(a === "face_on" && j.queued ? `${okMsg} ${j.queued} arquivo(s) na fila de indexação.` : okMsg);
    refresh();
  }

  const tabs: [Tab, string][] = [
    ["overview", "Visão geral"],
    ["upload", "Enviar arquivos"],
    ["media", "Mídias e destaques"],
    ["consents", "Autorizações"],
    ["edit", "Editar evento"],
  ];

  return (
    <>
      <div className="row">
        <Link className="btn sm ghost" href="/admin">
          ‹ Eventos
        </Link>
      </div>
      <div className="row">
        <h1 className="grow" style={{ fontSize: 26 }}>
          {e.name}
        </h1>
        {e.accessOpen ? <span className="pill p-ok">Liberado até {e.accessUntil}</span> : <span className="pill p-warn">Bloqueado</span>}
      </div>
      <p className="muted" style={{ marginTop: -10 }}>
        {e.dateLong} · {e.city}
        {e.accessCode ? ` · código ${e.accessCode}` : " · álbum público"}
      </p>
      <div className="seg" role="tablist">
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" aria-pressed={tab === k} aria-selected={tab === k} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <div className="two">
          <div className="stack">
            <div className={`panel ${e.accessOpen ? "" : "warn"}`}>
              <div className="row">
                <h2 className="grow">Acesso dos convidados</h2>
                {e.accessOpen ? <span className="pill p-ok">Liberado até {e.accessUntil}</span> : <span className="pill p-warn">Bloqueado</span>}
              </div>
              <p>
                {e.accessOpen
                  ? `Busca, álbum, downloads e QRs individuais liberados até ${e.accessUntil}. Depois disso bloqueiam sozinhos e mostram o botão para pedir liberação pelo WhatsApp.`
                  : `Busca, álbum, downloads e QRs individuais estão bloqueados desde ${e.accessUntil}. Os convidados veem a capa, os destaques e o botão do WhatsApp.`}
              </p>
              <div className="row">
                <button className="btn primary" onClick={() => action("extend_access", "Liberado por mais 30 dias para todos os convidados.")}>
                  Liberar por mais 30 dias
                </button>
                {e.accessOpen && (
                  <button
                    className="btn"
                    onClick={() =>
                      setConfirm({
                        title: "Bloquear o acesso agora?",
                        text: "Os convidados deixam de buscar e baixar. A capa e os destaques continuam visíveis, com o botão para pedir liberação pelo WhatsApp.",
                        label: "Bloquear",
                        run: () => action("block_access", "Acesso bloqueado."),
                      })
                    }
                  >
                    Bloquear agora
                  </button>
                )}
              </div>
              <small className="muted">A liberação vale para todos os convidados do evento. Nova data se liberar agora: {e.nextAccessUntil}.</small>
            </div>

            <div className="panel">
              <h2>Resumo</h2>
              <div className="stats">
                <Stat n={s.photos} l="Fotos" />
                <Stat n={s.videos} l="Vídeos" />
                <Stat n={s.uploading + s.processing} l="Em processamento" />
                <Stat n={fmtBytes(s.storageBytes)} l="Espaço ocupado" />
                <Stat n={s.faceIndexed} l="Na busca facial" />
                <Stat n={s.highlights} l="Destaques" />
              </div>
              {(s.failed > 0 || s.facePending > 0 || s.duplicates > 0) && (
                <p className="small muted">
                  {s.failed > 0 && `${s.failed} com falha (veja em Mídias). `}
                  {s.facePending > 0 && `${s.facePending} entrando na busca facial. `}
                  {s.duplicates > 0 && `${s.duplicates} duplicata(s) descartada(s) sem guardar cópia. `}
                </p>
              )}
              <h2>Uso da IA (custo)</h2>
              <div className="stats">
                <Stat n={s.aiUsage.indexPhoto} l="Fotos indexadas" />
                <Stat n={s.aiUsage.indexVideoFrame} l="Quadros de vídeo" />
                <Stat n={s.aiUsage.search + s.aiUsage.detectSelfie} l="Chamadas de busca" />
                <Stat n={s.searches} l="Buscas feitas" />
              </div>
            </div>

            <div className="panel">
              <h2>Privacidade e divulgação</h2>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={e.faceEnabled && !e.facePurged}
                  disabled={!e.facesAvailable || e.facePurged}
                  onChange={(x) => action(x.target.checked ? "face_on" : "face_off", x.target.checked ? "Busca facial ligada." : "Busca facial desligada.")}
                />
                <span>
                  <b>Busca facial</b>
                  <small>
                    {!e.facesAvailable
                      ? "Reconhecimento facial não configurado neste servidor."
                      : e.facePurged
                        ? `Encerrada em ${e.faceUntil} (${props.faceDays} dias após o evento). Os dados biométricos foram apagados.`
                        : `Começa desligada. Disponível até ${e.faceUntil}; depois o índice facial é apagado automaticamente. Só indexa capturas com autorização de todos os participantes.`}
                  </small>
                </span>
              </label>
              <p className="small muted">
                Navegação pelo álbum completo: <b>{e.allowFullBrowse ? "ligada" : "desligada"}</b> · Portfólio: <b>{e.showInPortfolio ? "exibido" : "não exibido"}</b>. Altere em
                “Editar evento”.
              </p>
              <div className="row">
                {!e.facePurged && e.facesAvailable && (
                  <button
                    className="btn"
                    onClick={() =>
                      setConfirm({
                        title: "Excluir os dados biométricos deste evento?",
                        text: "A coleção facial é apagada e a busca por selfie é desligada de vez para este evento. Fotos, vídeos, destaques e QRs individuais continuam.",
                        label: "Excluir dados biométricos",
                        danger: true,
                        run: () => action("purge_faces", "Dados biométricos excluídos."),
                      })
                    }
                  >
                    Excluir dados biométricos
                  </button>
                )}
                <button
                  className="btn danger"
                  onClick={() =>
                    setConfirm({
                      title: "Excluir o evento inteiro?",
                      text: "Apaga originais, prévias, destaques, links e dados biométricos. Não pode ser desfeito. Digite o nome do evento para confirmar.",
                      label: "Excluir evento",
                      danger: true,
                      typeName: true,
                      run: async () => {},
                    })
                  }
                >
                  Excluir evento
                </button>
              </div>
            </div>
          </div>

          <div className="panel qrbox">
            <h2>QR Code do evento</h2>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="qr" src={svgDataUrl(props.qr)} alt={`QR Code para ${e.publicUrl}`} />
            <div className="linkline">
              <code>{e.publicUrl}</code>
              <button
                className="btn sm"
                onClick={() =>
                  navigator.clipboard.writeText(e.publicUrl).then(
                    () => toast("Link copiado."),
                    () => toast("Selecione o link para copiar."),
                  )
                }
              >
                Copiar
              </button>
            </div>
            <div className="row" style={{ justifyContent: "center" }}>
              <button className="btn primary" onClick={() => downloadQrPng(props.qr, `qr-${e.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase()}.png`)}>
                Baixar PNG
              </button>
              <a className="btn" href={`/api/admin/events/${e.id}/qr`}>
                SVG para gráfica
              </a>
              <a className="btn" href={e.publicUrl} target="_blank" rel="noopener">
                Ver como convidado
              </a>
              <a
                className="btn"
                href={`https://wa.me/?text=${encodeURIComponent(`Suas fotos e vídeos do ${e.name}: ${e.publicUrl}${e.accessCode ? ` (código ${e.accessCode})` : ""}`)}`}
                target="_blank"
                rel="noopener"
              >
                Enviar pelo WhatsApp
              </a>
            </div>
            <small className="muted">Imprima para o estande ou envie o link. O link continua o mesmo quando o evento é liberado de novo.</small>
          </div>
        </div>
      )}

      {tab === "upload" && (
        <div className="panel">
          <h2>Enviar fotos e vídeos</h2>
          <Uploader eventId={e.id} limits={props.limits} onChange={refresh} />
        </div>
      )}
      {tab === "media" && <MediaManager eventId={e.id} />}
      {tab === "consents" && <Consents eventId={e.id} />}
      {tab === "edit" && (
        <EventForm
          initial={props.form}
          accessDays={props.accessDays}
          faceDays={props.faceDays}
          onSaved={() => {
            toast("Alterações salvas.");
            setTab("overview");
          }}
        />
      )}

      {confirm && (
        <Confirm
          {...confirm}
          eventName={confirm.typeName ? e.name : undefined}
          onCancel={() => setConfirm(null)}
          onConfirm={async (typed) => {
            if (confirm.typeName) {
              const r = await fetch(`/api/admin/events/${e.id}`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmName: typed }) });
              const j = await r.json().catch(() => ({}));
              if (!r.ok) {
                toast(j.error ?? "Não foi possível excluir.");
                return;
              }
              window.location.href = "/admin";
              return;
            }
            setConfirm(null);
            await confirm.run();
          }}
        />
      )}
    </>
  );
}

function Stat({ n, l }: { n: number | string; l: string }) {
  return (
    <div className="stat">
      <b>{n}</b>
      <span>{l}</span>
    </div>
  );
}
