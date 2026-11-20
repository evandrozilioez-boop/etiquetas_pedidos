"use client";
import { useRouter } from "next/navigation";

export function RemovalList({ items }: { items: { id: string; name: string; contact: string; message: string; created_at: string; event_name: string | null }[] }) {
  const router = useRouter();
  return (
    <div className="tablewrap">
      <table>
        <thead>
          <tr>
            <th>Recebido</th>
            <th>Quem</th>
            <th>Evento</th>
            <th>Pedido</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id}>
              <td>{r.created_at}</td>
              <td>
                {r.name}
                <div className="small muted" style={{ userSelect: "all" }}>{r.contact}</div>
              </td>
              <td>{r.event_name ?? "—"}</td>
              <td style={{ maxWidth: 420 }}>{r.message}</td>
              <td>
                <button
                  className="btn sm"
                  onClick={async () => {
                    await fetch("/api/admin/removals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: r.id }) });
                    router.refresh();
                  }}
                >
                  Marcar como atendido
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="small muted">Para atender: abra o evento › Mídias, localize o arquivo e use “Excluir” (remove original, prévias, links e dados faciais).</p>
    </div>
  );
}
