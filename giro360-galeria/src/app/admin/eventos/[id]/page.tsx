import type { Metadata } from "next";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { AdminShell } from "@/components/admin/AdminShell";
import { EventAdmin } from "@/components/admin/EventAdmin";
import { requireAdminPage } from "@/lib/adminPage";
import { accessOpen, eventPublicUrl, eventStats, faceOpen, getEvent } from "@/lib/events";
import { config, facesAvailable, limitsForClient } from "@/lib/config";
import { isUuid } from "@/lib/tokens";
import { fmtDateLong, fmtDay } from "@/lib/format";
import { extendedAccess } from "@/lib/events";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Evento" };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> };

export default async function EventPage({ params, searchParams }: Props) {
  await requireAdminPage();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const event = await getEvent(id).catch(() => null);
  if (!event) notFound();
  const { tab } = await searchParams;
  const url = eventPublicUrl(event);
  const c = config();
  return (
    <AdminShell current="eventos">
      <EventAdmin
        initialTab={(["overview", "upload", "media", "consents", "edit"].includes(tab ?? "") ? tab : "overview") as any}
        event={{
          id: event.id,
          name: event.name,
          dateLong: fmtDateLong(event.event_date),
          city: event.city,
          publicUrl: url,
          accessCode: event.is_private ? event.access_code : null,
          accessOpen: accessOpen(event),
          accessUntil: fmtDay(event.access_until),
          nextAccessUntil: fmtDay(extendedAccess(event.access_until, c.ACCESS_EXTENSION_DAYS)),
          faceEnabled: event.face_search_enabled,
          faceOpen: faceOpen(event),
          faceUntil: fmtDay(event.face_until),
          facePurged: !!event.face_purged_at || new Date(event.face_until) <= new Date(),
          facesAvailable: facesAvailable(),
          allowFullBrowse: event.allow_full_browse,
          showInPortfolio: event.show_in_portfolio,
          isPrivate: event.is_private,
        }}
        form={{
          id: event.id,
          name: event.name,
          eventDate: event.event_date,
          city: event.city,
          description: event.description ?? "",
          isPrivate: event.is_private,
          accessCode: event.access_code ?? "",
          allowFullBrowse: event.allow_full_browse,
          showInPortfolio: event.show_in_portfolio,
        }}
        stats={await eventStats(event.id)}
        qr={await QRCode.toDataURL(url, { width: 480, margin: 2, errorCorrectionLevel: "M" })}
        limits={limitsForClient()}
        accessDays={c.ACCESS_DAYS}
        faceDays={c.FACE_DAYS}
      />
    </AdminShell>
  );
}
