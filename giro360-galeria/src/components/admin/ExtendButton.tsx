"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

/** "Liberar por mais 30 dias": vale para todos os convidados do evento. */
export function ExtendButton({ eventId, label = "Liberar por mais 30 dias", className = "btn sm primary" }: { eventId: string; label?: string; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch(`/api/admin/events/${eventId}/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "extend_access" }) });
        setBusy(false);
        router.refresh();
      }}
    >
      {busy ? "Liberando…" : label}
    </button>
  );
}
