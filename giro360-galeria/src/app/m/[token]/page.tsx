import type { Metadata } from "next";
import { GuestShell } from "@/components/guest/GuestShell";
import { resolveShareToken, toPublicMedia } from "@/lib/access";
import { getSettings, whatsappLink } from "@/lib/settings";
import { fmtBytes, fmtDateLong, fmtDay, fmtDuration } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Seu registro" };

type Props = { params: Promise<{ token: string }> };

/** QR individual: abre somente esta foto ou vídeo, sem selfie e sem depender da IA. */
export default async function CapturePage({ params }: Props) {
  const { token } = await params;
  const r = await resolveShareToken(token);
  if (!r) {
    return (
      <GuestShell>
        <div className="wrap">
          <div className="gbody">
            <div className="gcard">
              <h2>Link indisponível</h2>
              <p>Este link não existe, foi revogado ou o arquivo foi retirado da galeria. Fale com a equipe da Giro 360 se precisar de ajuda.</p>
            </div>
          </div>
        </div>
      </GuestShell>
    );
  }
  const { event, media, state } = r;
  const settings = await getSettings();
  const pub = state === "ok" ? await toPublicMedia(media) : null;
  const wa = whatsappLink(settings.whatsapp, event.name, event.event_date);
  const what = media.kind === "video" ? "vídeo" : "foto";
  return (
    <GuestShell footNote={state !== "access_closed" ? <>Download liberado até <b>{fmtDay(event.access_until)}</b>.</> : null}>
      <div className="wrap">
        <div className="gbody" style={{ paddingTop: 4 }}>
          <div>
            <h1 style={{ fontSize: 24 }}>
              Sua {what} no {event.name}
            </h1>
            <p style={{ marginTop: 4, color: "var(--gallery-muted)" }}>
              {fmtDateLong(event.event_date)} · {event.city}
            </p>
          </div>
          {state === "access_closed" ? (
            <div className="gcard">
              <h2>O prazo de download terminou</h2>
              <p>Este link ficou liberado até {fmtDay(event.access_until)}. Peça a liberação para a equipe da Giro 360.</p>
              {wa && (
                <a className="btn big wa" href={wa} target="_blank" rel="noopener">
                  Pedir liberação pelo WhatsApp
                </a>
              )}
            </div>
          ) : (
            <>
              {pub ? (
                <div style={{ borderRadius: 16, overflow: "hidden", background: "#000" }}>
                  {media.kind === "video" ? (
                    <video src={pub.previewUrl ?? undefined} poster={pub.posterUrl ?? undefined} controls playsInline preload="metadata" style={{ width: "100%", display: "block" }} />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={pub.previewUrl ?? ""} alt={`Sua ${what}`} style={{ width: "100%", display: "block" }} />
                  )}
                </div>
              ) : (
                <div className="notice n-info">
                  <b>Estamos preparando a prévia</b>
                  <span>O arquivo já chegou e você já pode baixar o original. A prévia aparece aqui em instantes.</span>
                </div>
              )}
              <a className="btn primary big" href={`/api/m/${token}/download`}>
                Baixar original
              </a>
              <p className="deadline">
                {media.kind === "video" ? `Vídeo completo${media.duration_sec ? ` (${fmtDuration(Number(media.duration_sec))})` : ""}` : "Foto em resolução máxima"} ·{" "}
                {fmtBytes(Number(media.size_bytes))}. No iPhone, abra o arquivo baixado e toque em Compartilhar › Salvar {media.kind === "video" ? "vídeo" : "imagem"}.
                <br />
                Este link é pessoal e funciona sem selfie.
              </p>
            </>
          )}
        </div>
      </div>
    </GuestShell>
  );
}
