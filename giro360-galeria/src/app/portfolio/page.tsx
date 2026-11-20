import type { Metadata } from "next";
import Link from "next/link";
import { GuestShell } from "@/components/guest/GuestShell";
import { q } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { presignGet } from "@/lib/storage";
import { monthYear } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Portfólio", robots: { index: true, follow: true } };

/** Página pública para o site da Giro: eventos marcados para o portfólio, com capa e destaques autorizados. */
export default async function Portfolio() {
  const s = await getSettings();
  const events = await q<{ name: string; city: string; event_date: string; public_token: string; cover_thumb_key: string | null; thumb_key: string | null; n: string }>(
    `select e.name, e.city, to_char(e.event_date,'YYYY-MM-DD') as event_date, e.public_token, e.cover_thumb_key,
       (select m.thumb_key from media m where m.event_id=e.id and m.highlight and m.image_use and m.published and m.status='ready'
        order by m.created_at limit 1) as thumb_key,
       (select count(*) from media m where m.event_id=e.id and m.highlight and m.image_use and m.published and m.status='ready') as n
     from events e where e.show_in_portfolio order by e.event_date desc`,
  );
  const list = events.filter((e) => Number(e.n) > 0 || e.cover_thumb_key);
  const cards = await Promise.all(
    list.map(async (e) => ({ ...e, img: e.cover_thumb_key ? await presignGet(e.cover_thumb_key, { ttl: 3600 }) : e.thumb_key ? await presignGet(e.thumb_key, { ttl: 3600 }) : null })),
  );
  return (
    <GuestShell right={<small style={{ color: "var(--gallery-muted)" }}>Portfólio</small>}>
      <div className="wrap">
        <div className="pbody">
          <div className="phero">
            <h1>{s.portfolioTitle}</h1>
            <p>{s.portfolioText}</p>
          </div>
          {cards.length ? (
            <div className="pgrid">
              {cards.map((e) => (
                <Link key={e.public_token} className="pcard" href={`/e/${e.public_token}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {e.img && <img src={e.img} alt="" loading="lazy" />}
                  <div className="pcap">
                    <b>{e.name}</b>
                    <span>
                      {e.city} · {monthYear(e.event_date)}
                      {Number(e.n) ? ` · ${e.n} destaque${Number(e.n) > 1 ? "s" : ""}` : ""}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p style={{ color: "var(--gallery-muted)" }}>Em breve, os destaques dos nossos eventos.</p>
          )}
        </div>
      </div>
    </GuestShell>
  );
}
