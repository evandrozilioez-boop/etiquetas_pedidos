import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { EventForm } from "@/components/admin/EventForm";
import { requireAdminPage } from "@/lib/adminPage";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Novo evento" };

export default async function NewEvent() {
  await requireAdminPage();
  const c = config();
  return (
    <AdminShell current="novo">
      <div className="row">
        <h1>Novo evento</h1>
      </div>
      <EventForm accessDays={c.ACCESS_DAYS} faceDays={c.FACE_DAYS} />
    </AdminShell>
  );
}
