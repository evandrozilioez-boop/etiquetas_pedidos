import { config } from "./config";
import { q, q1 } from "./db";

export type SiteSettings = {
  logoKey: string | null;
  whatsapp: string;
  removalContact: string;
  portfolioTitle: string;
  portfolioText: string;
};

export async function getSettings(): Promise<SiteSettings> {
  const rows = await q<{ key: string; value: any }>("select key, value from settings");
  const v = Object.fromEntries(rows.map((r) => [r.key, r.value]));
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
    `insert into settings(key, value, updated_at) values ($1, $2, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  );
}

export async function getSetting<T>(key: string): Promise<T | null> {
  return (await q1<{ value: T }>("select value from settings where key=$1", [key]))?.value ?? null;
}

/** Link de WhatsApp com a mensagem pronta pedindo a liberação do evento. */
export function whatsappLink(number: string, eventName: string, eventDate: string, extra = "") {
  const digits = number.replace(/\D/g, "");
  if (!digits) return null;
  const [y, m, d] = eventDate.split("-");
  const msg = `Olá, Giro 360! Gostaria de liberar o acesso às fotos e vídeos do evento "${eventName}" (${d}/${m}/${y}).${extra}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`;
}
