import { config } from "./config";
import { nowIso, q, q1 } from "./db";

export type SiteSettings = {
  logoKey: string | null;
  whatsapp: string;
  removalContact: string;
  portfolioTitle: string;
  portfolioText: string;
};

export async function getSettings(): Promise<SiteSettings> {
  const rows = await q<{ key: string; value: string }>("select key, value from settings");
  const v: Record<string, any> = {};
  for (const r of rows) {
    try {
      v[r.key] = JSON.parse(r.value);
    } catch {
      v[r.key] = r.value;
    }
  }
  const c = config();
  return {
    logoKey: v.logoKey ?? null,
    whatsapp: v.whatsapp ?? c.WHATSAPP_NUMBER,
    removalContact: v.removalContact ?? c.REMOVAL_REQUEST_CONTACT,
    portfolioTitle: v.portfolioTitle ?? "Ativações que viram memória",
    portfolioText: v.portfolioText ?? "Totens de foto e Plataforma 360 em eventos. Alguns momentos que registramos.",
  };
}

export async function setSetting(key: keyof SiteSettings, value: unknown) {
  await q(
    `insert into settings(key, value, updated_at) values ($1, $2, $3)
     on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at`,
    [key, JSON.stringify(value), nowIso()],
  );
}

export async function getSetting<T>(key: string): Promise<T | null> {
  const r = await q1<{ value: string }>("select value from settings where key=$1", [key]);
  return r ? (JSON.parse(r.value) as T) : null;
}

/** Link de WhatsApp com a mensagem pronta pedindo a liberação do evento. */
export function whatsappLink(number: string, eventName: string, eventDate: string, extra = "") {
  const digits = number.replace(/\D/g, "");
  if (!digits) return null;
  const [y, m, d] = eventDate.split("-");
  const msg = `Olá, Giro 360! Gostaria de liberar o acesso às fotos e vídeos do evento "${eventName}" (${d}/${m}/${y}).${extra}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
}
