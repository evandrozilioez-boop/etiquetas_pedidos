"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Lightbox, Tile, type GuestItem } from "./Lightbox";
import { prepareSelfie } from "./selfie";

export type GuestEventProps = {
  token: string;
  name: string;
  isPrivate: boolean;
  allowFullBrowse: boolean;
  accessOpen: boolean;
  accessUntil: string; // dd/mm/aaaa
  faceOpen: boolean;
  faceUntil: string;
  faceEverEnabled: boolean;
  verified: boolean;
  whatsappLink: string | null;
  whatsappHelpLink: string | null;
  whatsappDisplay: string | null;
  highlights: GuestItem[];
  demoMode: boolean;
};

type Step = "landing" | "code" | "explain" | "camera" | "searching" | "results" | "album";
type Msg = { cls: "n-warn" | "n-bad" | "n-info" | "n-ok"; title: string; text: string } | null;
type Result =
  | { status: "matches"; items: (GuestItem & { similarity?: number })[]; pending: number }
  | { status: "no_match"; pending: number }
  | { status: "processing"; pending: number }
  | { status: "error"; message: string };

const WA_ICON = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
    <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" />
  </svg>
);
const CAM = (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);
const IMG = (
  <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="9" cy="10" r="2" />
    <path d="m21 16-5-5-9 9" />
  </svg>
);

export function GuestApp(p: GuestEventProps) {
  const [step, setStep] = useState<Step>("landing");
  const [after, setAfter] = useState<"explain" | "album">("explain");
  const [verified, setVerified] = useState(p.verified);
  const [code, setCode] = useState("");
  const [codeErr, setCodeErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [filter, setFilter] = useState<"all" | "photo" | "video">("all");
  const [album, setAlbum] = useState<{ items: GuestItem[]; next: string | null } | null>(null);
  const [lb, setLb] = useState<{ items: GuestItem[]; index: number; download: boolean } | null>(null);
  const lastBlob = useRef<Blob | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const api = `/api/e/${p.token}`;
  const needCode = p.isPrivate && !verified;

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);
  useEffect(() => stopCamera, [stopCamera]);
  useEffect(() => {
    window.scrollTo({ top: step === "landing" ? 0 : Math.min(window.scrollY, 260), behavior: "smooth" });
  }, [step]);

  async function ensureSession(): Promise<boolean> {
    if (p.isPrivate) return verified;
    if (verified) return true;
    const r = await fetch(`${api}/session`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    if (r.ok) setVerified(true);
    return r.ok;
  }

  function go(target: "explain" | "album") {
    setAfter(target);
    setMsg(null);
    if (needCode) setStep("code");
    else if (target === "album") void openAlbum();
    else setStep("explain");
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setCodeErr(null);
    try {
      const r = await fetch(`${api}/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setCodeErr(j.error ?? "Não foi possível validar o código. Tente de novo.");
        return;
      }
      setVerified(true);
      if (after === "album") await openAlbum(true);
      else setStep("explain");
    } catch {
      setCodeErr("Sem conexão. Confira a internet e tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  async function openAlbum(skipSession = false, cursor: string | null = null) {
    if (!skipSession && !(await ensureSession())) return;
    setBusy(true);
    try {
      const r = await fetch(`${api}/media${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);
      const j = await r.json();
      if (!r.ok) {
        if (j.code === "need_code") {
          setVerified(false);
          setStep("code");
        } else setMsg({ cls: "n-bad", title: "Não foi possível abrir o álbum", text: j.error ?? "Tente de novo em instantes." });
        return;
      }
      setAlbum((prev) => ({ items: cursor && prev ? [...prev.items, ...j.items] : j.items, next: j.nextCursor }));
      setFilter("all");
      setStep("album");
    } catch {
      setMsg({ cls: "n-bad", title: "Sem conexão", text: "Confira a internet e tente de novo." });
    } finally {
      setBusy(false);
    }
  }

  function requireConsent() {
    if (consent) return true;
    setMsg({ cls: "n-warn", title: "Falta sua autorização", text: "Marque a caixa acima para continuar." });
    return false;
  }

  async function startCamera() {
    if (!requireConsent()) return;
    setMsg(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setMsg({ cls: "n-info", title: "Câmera indisponível neste navegador", text: "Use “Escolher uma foto”: no celular, essa opção também permite tirar a foto na hora." });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
      streamRef.current = stream;
      setStep("camera");
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => undefined);
        }
      });
    } catch {
      setMsg({
        cls: "n-info",
        title: "A câmera está bloqueada",
        text: "Você pode liberar a câmera nos ajustes do navegador ou usar “Escolher uma foto” — ela também permite tirar a foto na hora.",
      });
    }
  }

  async function capture() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const c = document.createElement("canvas");
    const k = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
    c.width = Math.round(v.videoWidth * k);
    c.height = Math.round(v.videoHeight * k);
    const ctx = c.getContext("2d")!;
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1); // mesma orientação que a pessoa viu na tela
    ctx.drawImage(v, 0, 0, c.width, c.height);
    stopCamera();
    await runSearch(c);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    await runSearch(f);
  }

  async function runSearch(source: Blob | HTMLCanvasElement) {
    setMsg(null);
    let prepared;
    try {
      prepared = await prepareSelfie(source);
    } catch {
      setStep("explain");
      setMsg({ cls: "n-bad", title: "Não conseguimos abrir essa imagem", text: "Tente outra foto, de preferência tirada agora." });
      return;
    }
    if (prepared.brightness < 45) {
      setStep("explain");
      setMsg({ cls: "n-warn", title: "A foto está muito escura", text: "Procure um lugar mais iluminado ou vire o rosto para a luz e tente de novo." });
      return;
    }
    lastBlob.current = prepared.blob;
    setSelfiePreview(prepared.preview);
    await sendSearch(prepared.blob);
  }

  async function sendSearch(blob: Blob) {
    setStep("searching");
    if (!(await ensureSession())) {
      setStep("code");
      return;
    }
    const form = new FormData();
    form.set("consent", "yes");
    form.set("selfie", blob, "selfie.jpg");
    try {
      const r = await fetch(`${api}/search`, { method: "POST", body: form });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        setResult(j);
        setFilter("all");
        setStep("results");
        return;
      }
      const guide: Record<string, Msg> = {
        no_face: { cls: "n-warn", title: "Não encontramos um rosto nesta foto", text: "Envie uma foto de frente, com o rosto inteiro aparecendo e sem óculos escuros." },
        multiple_faces: { cls: "n-warn", title: "Encontramos mais de um rosto", text: "Envie uma foto em que apareça apenas você." },
        too_dark: { cls: "n-warn", title: "A foto está muito escura", text: "Procure um lugar mais iluminado e tente de novo." },
        bad_image: { cls: "n-bad", title: "Não conseguimos abrir essa imagem", text: "Tente outra foto em JPEG ou PNG." },
        rate_limited: { cls: "n-warn", title: "Muitas buscas seguidas", text: j.error ?? "Aguarde alguns minutos e tente de novo." },
        face_disabled: { cls: "n-info", title: "Busca por selfie indisponível", text: "A busca por selfie não está ativa neste evento." },
      };
      if (j.code === "search_unavailable" || r.status >= 500) {
        setResult({ status: "error", message: j.error ?? "Falha temporária na busca." });
        setStep("results");
        return;
      }
      if (j.code === "need_code") {
        setVerified(false);
        setAfter("explain");
        setStep("code");
        return;
      }
      if (j.code === "access_closed") {
        window.location.reload();
        return;
      }
      setStep("explain");
      setMsg(guide[j.code] ?? { cls: "n-bad", title: "Não foi possível buscar", text: j.error ?? "Tente de novo." });
    } catch {
      setResult({ status: "error", message: "Sem conexão com a internet." });
      setStep("results");
    }
  }

  const download = (m: GuestItem) => `${api}/media/${m.id}/download`;

  // ------------------------------------------------------------------ telas
  if (!p.accessOpen) {
    return (
      <>
        <div className="gcard">
          <h2>O prazo de download terminou</h2>
          <p>
            As fotos e vídeos deste evento ficaram liberados até {p.accessUntil}. Peça para a equipe da Giro 360 liberar de novo: a liberação vale por
            mais 30 dias para todos os convidados.
          </p>
          {p.whatsappLink ? (
            <a className="btn big wa" href={p.whatsappLink} target="_blank" rel="noopener">
              {WA_ICON}Pedir liberação pelo WhatsApp
            </a>
          ) : (
            <p>Fale com a equipe da Giro 360 para pedir a liberação.</p>
          )}
          {p.whatsappDisplay && <p className="deadline">A mensagem já vai pronta com o nome do evento. Atendimento: {p.whatsappDisplay}</p>}
        </div>
        <Highlights items={p.highlights} onOpen={(i) => setLb({ items: p.highlights, index: i, download: false })} />
        {lb && <Lightbox items={lb.items} index={lb.index} onIndex={(i) => setLb({ ...lb, index: i })} onClose={() => setLb(null)} note="Destaque do evento." />}
      </>
    );
  }

  const shown = (list: GuestItem[]) => list.filter((m) => filter === "all" || m.kind === filter);

  return (
    <>
      {step === "landing" && (
        <>
          <div className="gcard">
            <h2>Encontre as suas fotos e vídeos</h2>
            {p.faceOpen ? (
              <>
                <p>
                  Envie uma selfie e mostramos os registros do totem e da Plataforma 360 em que você provavelmente aparece. Você baixa os arquivos
                  originais, em qualidade máxima.
                </p>
                <button className="btn primary big" onClick={() => go("explain")}>
                  Encontrar minhas fotos e vídeos
                </button>
              </>
            ) : (
              <p>
                {p.faceEverEnabled
                  ? `A busca por selfie fica disponível por 90 dias após o evento e foi encerrada em ${p.faceUntil}.`
                  : "Este evento não usa busca por selfie."}{" "}
                {p.allowFullBrowse ? "Você pode ver o álbum completo." : "Use o QR Code individual recebido no estande ou fale com a gente."}
              </p>
            )}
            {p.allowFullBrowse && (
              <button className={`btn big ${p.faceOpen ? "ghost" : "primary"}`} style={p.faceOpen ? { color: "#fff", borderColor: "var(--gallery-line)" } : undefined} onClick={() => go("album")} disabled={busy}>
                Ver álbum completo
              </button>
            )}
            {!p.faceOpen && !p.allowFullBrowse && p.whatsappHelpLink && (
              <a className="btn big wa" href={p.whatsappHelpLink} target="_blank" rel="noopener">
                {WA_ICON}Pedir ajuda pelo WhatsApp
              </a>
            )}
            {msg && <Notice msg={msg} />}
            <p className="deadline">
              Download liberado até {p.accessUntil}
              {p.faceOpen ? ` · busca por selfie até ${p.faceUntil}` : ""}
            </p>
          </div>
          <Highlights items={p.highlights} onOpen={(i) => setLb({ items: p.highlights, index: i, download: false })} />
        </>
      )}

      {step === "code" && (
        <form className="gcard" onSubmit={submitCode}>
          <h2>Digite o código do evento</h2>
          <p>Este álbum é privado. O código está no estande e no material entregue pela produção.</p>
          <label className="sr" htmlFor="code">
            Código do evento
          </label>
          <input
            id="code"
            className="code-in"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={32}
            required
          />
          {codeErr && <div className="notice n-bad">{codeErr}</div>}
          <button className="btn primary big" disabled={busy}>
            {busy ? "Conferindo…" : "Continuar"}
          </button>
          <button type="button" className="btn ghost" style={{ color: "#fff", borderColor: "var(--gallery-line)" }} onClick={() => setStep("landing")}>
            Voltar
          </button>
        </form>
      )}

      {step === "explain" && (
        <>
          <div className="gcard">
            <h2>Como sua foto será usada</h2>
            <ul className="howto">
              <li>
                <b>1</b>
                <span>
                  Comparamos o seu rosto <strong>somente</strong> com as fotos e vídeos deste evento.
                </span>
              </li>
              <li>
                <b>2</b>
                <span>A selfie é usada só durante a busca e descartada em seguida. Ela não fica salva na galeria.</span>
              </li>
              <li>
                <b>3</b>
                <span>Os resultados são sugestões. Confira se é mesmo você antes de baixar.</span>
              </li>
            </ul>
            <label className="check">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>Entendi e autorizo o uso desta selfie apenas para esta busca.</span>
            </label>
          </div>
          <div className="gcard">
            <h2 style={{ fontSize: 17 }}>Envie uma foto com apenas o seu rosto</h2>
            <p>De frente, bem iluminada e sem óculos escuros.</p>
            <div className="choices">
              <button className="choice" onClick={startCamera}>
                {CAM}Tirar uma selfie<small>Usa a câmera frontal</small>
              </button>
              <button className="choice" onClick={() => requireConsent() && fileRef.current?.click()}>
                {IMG}Escolher uma foto<small>Da galeria do celular</small>
              </button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
            {msg && <Notice msg={msg} />}
            {p.demoMode && (
              <p className="small">
                Modo demonstração: o reconhecimento é simulado e só reconhece as “pessoas” coloridas das fotos de exemplo.{" "}
                <a href="/demo/selfies">Baixe aqui as selfies de teste</a>.
              </p>
            )}
            <button className="btn ghost" style={{ color: "#fff", borderColor: "var(--gallery-line)" }} onClick={() => setStep("landing")}>
              Voltar
            </button>
          </div>
        </>
      )}

      {step === "camera" && (
        <div className="gcard">
          <div className="camera">
            <video ref={videoRef} playsInline muted autoPlay />
            <div className="oval" aria-hidden="true" />
          </div>
          <p>Encaixe o rosto no contorno, olhe para a câmera e toque em “Tirar foto”.</p>
          <button className="btn primary big" onClick={capture}>
            Tirar foto
          </button>
          <button
            className="btn ghost"
            style={{ color: "#fff", borderColor: "var(--gallery-line)" }}
            onClick={() => {
              stopCamera();
              setStep("explain");
            }}
          >
            Cancelar
          </button>
        </div>
      )}

      {step === "searching" && (
        <div className="gcard" style={{ textAlign: "center", padding: "40px 20px" }}>
          <div className="spinner" />
          <h2 style={{ fontSize: 19 }}>Procurando você nas fotos e vídeos…</h2>
          <p>Isso leva alguns segundos.</p>
        </div>
      )}

      {step === "results" && result && (
        <>
          <div className="gcard">
            <div className="selfie-prev">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {selfiePreview && <img src={selfiePreview} alt="Sua selfie" />}
              <div style={{ display: "grid", gap: 4 }}>
                <b>Sua busca</b>
                <span className="small" style={{ color: "var(--gallery-muted)" }}>
                  A selfie já foi descartada do servidor.
                </span>
                <button className="btn sm ghost" style={{ color: "#fff", borderColor: "var(--gallery-line)", width: "fit-content" }} onClick={() => setStep("explain")}>
                  Buscar com outra foto
                </button>
              </div>
            </div>
          </div>
          {result.status === "error" && (
            <div className="notice n-bad">
              <b>Falha temporária na busca</b>
              <span>Não foi um problema com a sua foto. Tente de novo em alguns instantes. Se recebeu um QR individual no estande, ele continua funcionando.</span>
              <button className="btn primary" style={{ marginTop: 6 }} onClick={() => lastBlob.current && sendSearch(lastBlob.current)}>
                Tentar de novo
              </button>
            </div>
          )}
          {result.status === "processing" && (
            <div className="notice n-info">
              <b>Ainda estamos preparando os arquivos</b>
              <span>
                Nenhum resultado por enquanto, mas {result.pending} arquivo(s) deste evento ainda estão em processamento. Volte em alguns minutos e busque de
                novo.
              </span>
            </div>
          )}
          {result.status === "no_match" && (
            <div className="notice n-warn">
              <b>Nenhuma correspondência encontrada</b>
              <span>
                Não achamos você nos arquivos já disponíveis. Tente uma selfie de frente, com boa luz. Se a sua foto foi entregue por QR individual, use aquele
                link.
              </span>
            </div>
          )}
          {result.status === "matches" && (
            <ResultGrid
              title={`Encontramos ${result.items.length} registro${result.items.length > 1 ? "s" : ""}`}
              subtitle="São sugestões: confira se é você antes de baixar."
              items={result.items}
              pending={result.pending}
              filter={filter}
              setFilter={setFilter}
              onOpen={(list, i) => setLb({ items: list, index: i, download: true })}
              shown={shown}
            />
          )}
          {p.allowFullBrowse && (
            <button className="btn ghost" style={{ color: "#fff", borderColor: "var(--gallery-line)" }} onClick={() => openAlbum()}>
              Ver álbum completo
            </button>
          )}
        </>
      )}

      {step === "album" && album && (
        <>
          <button className="btn sm ghost" style={{ color: "#fff", borderColor: "var(--gallery-line)", width: "fit-content" }} onClick={() => setStep("landing")}>
            ‹ Voltar
          </button>
          <ResultGrid
            title="Álbum completo"
            items={album.items}
            pending={0}
            filter={filter}
            setFilter={setFilter}
            onOpen={(list, i) => setLb({ items: list, index: i, download: true })}
            shown={shown}
          />
          {album.next && (
            <button className="btn ghost" style={{ color: "#fff", borderColor: "var(--gallery-line)" }} disabled={busy} onClick={() => openAlbum(true, album.next)}>
              {busy ? "Carregando…" : "Carregar mais"}
            </button>
          )}
          {msg && <Notice msg={msg} />}
        </>
      )}

      {lb && (
        <Lightbox
          items={lb.items}
          index={lb.index}
          onIndex={(i) => setLb({ ...lb, index: i })}
          onClose={() => setLb(null)}
          downloadHref={lb.download ? download : undefined}
          note="Destaque do evento. Para baixar a sua foto, use a busca ou o QR individual."
        />
      )}
    </>
  );
}

function Notice({ msg }: { msg: NonNullable<Msg> }) {
  return (
    <div className={`notice ${msg.cls}`} role="status">
      <b>{msg.title}</b>
      <span>{msg.text}</span>
    </div>
  );
}

function Highlights({ items, onOpen }: { items: GuestItem[]; onOpen: (i: number) => void }) {
  if (!items.length) return null;
  return (
    <div style={{ display: "grid", gap: 10 }}>
      <h2 style={{ fontSize: 19 }}>Destaques do evento</h2>
      <div className="grid">
        {items.map((m, i) => (
          <Tile key={m.id} m={m} onClick={() => onOpen(i)} label={`Destaque ${i + 1}`} />
        ))}
      </div>
    </div>
  );
}

function ResultGrid(props: {
  title: string;
  subtitle?: string;
  items: GuestItem[];
  pending: number;
  filter: "all" | "photo" | "video";
  setFilter: (f: "all" | "photo" | "video") => void;
  onOpen: (list: GuestItem[], i: number) => void;
  shown: (l: GuestItem[]) => GuestItem[];
}) {
  const photos = props.items.filter((i) => i.kind === "photo").length;
  const videos = props.items.length - photos;
  const list = props.shown(props.items);
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div>
        <h2 style={{ fontSize: 22 }}>{props.title}</h2>
        <p style={{ marginTop: 2, color: "var(--gallery-muted)" }}>
          {photos} foto{photos !== 1 ? "s" : ""} e {videos} vídeo{videos !== 1 ? "s" : ""}. {props.subtitle}
        </p>
      </div>
      {props.pending > 0 && (
        <div className="notice n-info">
          <span>Mais {props.pending} arquivo(s) ainda estão em processamento. Busque de novo daqui a pouco.</span>
        </div>
      )}
      <div className="filters" role="group" aria-label="Filtrar">
        {(
          [
            ["all", "Todos"],
            ["photo", "Fotos"],
            ["video", "Vídeos"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} aria-pressed={props.filter === k} onClick={() => props.setFilter(k)}>
            {l}
          </button>
        ))}
      </div>
      {list.length ? (
        <div className="grid">
          {list.map((m, i) => (
            <Tile key={m.id} m={m} onClick={() => props.onOpen(list, i)} label={`${m.kind === "video" ? "Vídeo" : "Foto"} ${i + 1}`} />
          ))}
        </div>
      ) : (
        <p style={{ color: "var(--gallery-muted)" }}>Nada neste filtro.</p>
      )}
    </div>
  );
}
