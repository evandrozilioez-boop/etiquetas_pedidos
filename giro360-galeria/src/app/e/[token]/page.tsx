import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { GuestShell } from "@/components/guest/GuestShell";
import { GuestApp } from "@/components/guest/GuestApp";
import { accessOpen, faceOpen, findEventByToken } from "@/lib/events";
import { guestCookieName, listHighlights } from "@/lib/access";
import { verifyJwt } from "@/lib/auth";
import { nowIso, q1 } from "@/lib/db";
import { getSettings, whatsappLink } from "@/lib/settings";
import { presignGet } from "@/lib/storage";
import { isMockFaces } from "@/lib/config";
import { fmtDateLong, fmtDay } from "@/lib/format";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const e = await findEventByToken((await params).token);
  return e ? { title: e.name, description: `Fotos e vídeos de ${e.name} — ${e.city}` } : { title: "Galeria não encontrada" };
}

export default async function EventPage({ params }: Props) {
  const { token } = await params;
  const event = await findEventByToken(token);
  if (!event) notFound();
  const settings = await getSettings();
  const jwt = (await cookies()).get(guestCookieName(event.id))?.value;
  const payload = await verifyJwt<{ sid: string; eid: string }>(jwt, "guest");
  let verified = false;
  if (payload?.eid === event.id) {
    const s = await q1<{ code_verified: boolean }>("select code_verified from guest_sessions where id=$1 and expires_at > $2", [payload.sid, nowIso()]);
    verified = !!s && (s.code_verified || !event.is_private);
  }
  const coverUrl = event.cover_key ? await presignGet(event.cover_key, { ttl: 3600 }) : null;
  const highlights = await listHighlights(event.id);
  const digits = settings.whatsapp.replace(/\D/g, "");

  return (
    <GuestShell footNote={<>Fotos e vídeos liberados para download até <b>{fmtDay(event.access_until)}</b>.</>}>
      <div className="cover">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {coverUrl && <img src={coverUrl} alt="" />}
        <div className="cover-text wrap">
          <h1>{event.name}</h1>
          <div className="meta">
            <span>{fmtDateLong(event.event_date)}</span>
            <span>{event.city}</span>
          </div>
        </div>
      </div>
      <div className="wrap">
        <div className="gbody">
          <GuestApp
            token={event.public_token}
            name={event.name}
            isPrivate={event.is_private}
            allowFullBrowse={event.allow_full_browse}
            accessOpen={accessOpen(event)}
            accessUntil={fmtDay(event.access_until)}
            faceOpen={faceOpen(event)}
            faceUntil={fmtDay(event.face_until)}
            faceEverEnabled={event.face_search_enabled || !!event.face_purged_at}
            verified={verified}
            whatsappLink={whatsappLink(settings.whatsapp, event.name, event.event_date)}
            whatsappHelpLink={whatsappLink(settings.whatsapp, event.name, event.event_date, " Preciso de ajuda para encontrar a minha foto.")}
            whatsappDisplay={digits.length >= 12 ? `+${digits.slice(0, 2)} (${digits.slice(2, 4)}) ${digits.slice(4, -4)}-${digits.slice(-4)}` : null}
            highlights={highlights}
            demoMode={isMockFaces()}
          />
        </div>
      </div>
    </GuestShell>
  );
}
