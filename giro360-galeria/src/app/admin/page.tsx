import type { Metadata } from "next";
import Link from "next/link";
import { AdminShell } from "@/components/admin/AdminShell";
import { ExtendButton } from "@/components/admin/ExtendButton";
import { requireAdminPage } from "@/lib/adminPage";
import { accessOpen, listEvents } from "@/lib/events";
import { presignGet } from "@/lib/storage";
import { fmtDateLong, fmtDay } from "@/lib/format";
import { q1 } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Eventos" };

type Props = { searchParams: Promise<{ f?: string }> };

export default async function Dashboard({ searchParams }: Props) {
  await requireAdminPage();
  const { f = "all" } = await searchParams;
  const all = await listEvents();
  const blockedCount = all.filter((e) => !accessOpen(e)).length;
  const list = all.filter((e) => f === "all" || (f === "open" && accessOpen(e)) || (f === "blocked" && !accessOpen(e)) || (f === "portfolio" && e.show_in_portfolio));
  const covers = await Promise.all(list.map((e) => (e.cover_thumb_key ? presignGet(e.cover_thumb_key, { ttl: 3600 }) : null)));
  const removals = await q1<{ n: string }>("select count(*) as n from removal_requests where status='open'");
  const filters: [string, string][] = [
    ["all", "Todos"],
    ["open", "Liberados"],
    ["blocked", `Bloqueados (${blockedCount})`],
    ["portfolio", "No portfólio"],
  ];
  return (
    <AdminShell current="eventos">
      <div className="row">
        <h1>Eventos</h1>
        <nav className="seg" aria-label="Filtrar eventos">
          {filters.map(([k, l]) => (
            <Link key={k} href={k === "all" ? "/admin" : `/admin?f=${k}`} aria-current={f === k ? "page" : undefined}>
              {l}
            </Link>
          ))}
        </nav>
        <Link className="btn primary" href="/admin/eventos/novo">
          + Novo evento
        </Link>
      </div>
      {Number(removals?.n) > 0 && (
        <Link href="/admin/configuracoes#remocoes" className="demo-flag" style={{ textDecoration: "none" }}>
          {removals!.n} pedido(s) de remoção aguardando atendimento →
        </Link>
      )}
      {list.length === 0 ? (
        <div className="panel">
          <h2>{all.length ? "Nenhum evento neste filtro" : "Nenhum evento ainda"}</h2>
          <p className="muted">Crie um evento, envie as fotos do totem e os vídeos da Plataforma 360 e compartilhe o QR Code com os convidados.</p>
          <Link className="btn primary" href="/admin/eventos/novo" style={{ width: "fit-content" }}>
            Criar evento
          </Link>
        </div>
      ) : (
        <div className="cards">
          {list.map((e, i) => {
            const open = accessOpen(e);
            return (
              <div className="ecard" key={e.id}>
                <Link href={`/admin/eventos/${e.id}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {covers[i] ? <img className="thumb" src={covers[i]!} alt="" /> : <div className="thumb" />}
                  <div className="in">
                    <div className="row" style={{ gap: 8 }}>
                      <h3 className="grow">{e.name}</h3>
                      {open ? <span className="pill p-ok">Liberado até {fmtDay(e.access_until)}</span> : <span className="pill p-warn">Bloqueado</span>}
                    </div>
                    <span className="muted small">
                      {fmtDateLong(e.event_date)} · {e.city}
                    </span>
                    <div className="nums">
                      <span>{e.photos} fotos</span>
                      <span>{e.videos} vídeos</span>
                      {e.processing > 0 && <span style={{ color: "var(--warn)" }}>{e.processing} processando</span>}
                      {e.show_in_portfolio && <span>No portfólio ({e.highlights})</span>}
                    </div>
                  </div>
                </Link>
                {!open && (
                  <div className="act">
                    <ExtendButton eventId={e.id} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AdminShell>
  );
}
