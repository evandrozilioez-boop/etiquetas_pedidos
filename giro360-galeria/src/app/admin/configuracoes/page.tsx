import type { Metadata } from "next";
import { AdminShell } from "@/components/admin/AdminShell";
import { SettingsForm } from "@/components/admin/SettingsForm";
import { RemovalList } from "@/components/admin/RemovalList";
import { requireAdminPage } from "@/lib/adminPage";
import { getSettings } from "@/lib/settings";
import { presignGet } from "@/lib/storage";
import { q, q1 } from "@/lib/db";
import { config } from "@/lib/config";
import { fmtDateTime } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Configurações" };

export default async function SettingsPage() {
  await requireAdminPage();
  const s = await getSettings();
  const removals = await q<{ id: string; name: string; contact: string; message: string; created_at: Date; event_name: string | null }>(
    `select r.id, r.name, r.contact, r.message, r.created_at, e.name as event_name
     from removal_requests r left join events e on e.id = r.event_id where r.status='open' order by r.created_at`,
  );
  const deletions = await q1<{ n: string; failing: string; last: string | null }>(
    `select count(*) as n, count(*) filter (where attempts > 0) as failing,
       (select last_error from deletion_tasks where status='pending' and last_error is not null order by updated_at desc limit 1) as last
     from deletion_tasks where status='pending'`,
  );
  const failedJobs = await q1<{ n: string }>("select count(*) as n from jobs where status='failed'");
  const usage = await q1<{ photos: string; frames: string; searches: string }>(
    `select coalesce(sum(units) filter (where kind='index_photo'),0) as photos,
            coalesce(sum(units) filter (where kind='index_video_frame'),0) as frames,
            coalesce(sum(units) filter (where kind in ('search','detect_selfie')),0) as searches
     from ai_usage where created_at >= date_trunc('month', now())`,
  );
  const bytes = await q1<{ b: string }>("select coalesce(sum(size_bytes + derived_bytes),0) as b from media where status in ('received','processing','ready')");
  const c = config();
  return (
    <AdminShell current="config">
      <div className="row">
        <h1>Configurações</h1>
      </div>
      <div className="two">
        <SettingsForm initial={{ whatsapp: s.whatsapp, removalContact: s.removalContact, portfolioTitle: s.portfolioTitle, portfolioText: s.portfolioText }} logoUrl={s.logoKey ? await presignGet(s.logoKey) : null} />
        <div className="stack">
          <div className="panel">
            <h2>Prazos</h2>
            <div className="stats">
              <div className="stat"><b>{c.ACCESS_DAYS} dias</b><span>Download liberado</span></div>
              <div className="stat"><b>+{c.ACCESS_EXTENSION_DAYS} dias</b><span>Cada liberação</span></div>
              <div className="stat"><b>{c.FACE_DAYS} dias</b><span>Busca por selfie</span></div>
              <div className="stat"><b>Sem prazo</b><span>Galeria e destaques</span></div>
            </div>
            <p className="muted small">Alterados pelas variáveis ACCESS_DAYS, ACCESS_EXTENSION_DAYS e FACE_DAYS do servidor.</p>
          </div>
          <div className="panel">
            <h2>Uso deste mês</h2>
            <div className="stats">
              <div className="stat"><b>{(Number(bytes?.b ?? 0) / 1e9).toFixed(2).replace(".", ",")} GB</b><span>Armazenamento total</span></div>
              <div className="stat"><b>{usage?.photos}</b><span>Fotos indexadas</span></div>
              <div className="stat"><b>{usage?.frames}</b><span>Quadros de vídeo</span></div>
              <div className="stat"><b>{usage?.searches}</b><span>Chamadas de busca</span></div>
            </div>
            <p className="muted small">Para estimar o custo mensal, rode <code>npm run cost:estimate</code> (veja docs/custos.md).</p>
          </div>
          <div className="panel">
            <h2>Pendências técnicas</h2>
            <p className="small">
              Exclusões pendentes no armazenamento/IA: <b>{deletions?.n}</b>
              {Number(deletions?.failing) > 0 && ` (${deletions?.failing} com falha, repetindo automaticamente)`}
              <br />
              Tarefas de processamento que falharam de vez: <b>{failedJobs?.n}</b>
            </p>
            {deletions?.last && <p className="small muted">Último erro: {deletions.last}</p>}
          </div>
        </div>
      </div>
      <div className="panel" id="remocoes">
        <h2>Pedidos de remoção</h2>
        {removals.length === 0 ? (
          <p className="muted">Nenhum pedido aberto.</p>
        ) : (
          <RemovalList items={removals.map((r) => ({ ...r, created_at: fmtDateTime(r.created_at) }))} />
        )}
      </div>
    </AdminShell>
  );
}
