import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { QuickUpload } from "@/components/admin/QuickUpload";
import { requireAdminPage } from "@/lib/adminPage";
import { listEvents } from "@/lib/events";
import { limitsForClient } from "@/lib/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Enviar arquivos" };

/** Envio rápido (pensado para o iPhone da operação): escolhe o evento e seleciona do app Fotos. */
export default async function SendPage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  await requireAdminPage();
  const events = (await listEvents()).map((e) => ({ id: e.id, name: e.name, date: e.event_date }));
  const { e } = await searchParams;
  return (
    <AdminShell current="enviar">
      <div className="row">
        <h1>Enviar arquivos</h1>
      </div>
      <QuickUpload events={events} initial={e && events.some((x) => x.id === e) ? e : events[0]?.id ?? null} limits={limitsForClient()} />
      <p className="muted small">
        Dica para o iPhone: no Safari, toque em Compartilhar › “Adicionar à Tela de Início” para abrir o painel como um app.
      </p>
    </AdminShell>
  );
}
