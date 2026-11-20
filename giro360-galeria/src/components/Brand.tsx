import { getSettings } from "@/lib/settings";
import { presignGet } from "@/lib/storage";

/**
 * Logo da Giro 360: a enviada no painel (Configurações) tem prioridade; senão, a logo oficial incluída no projeto.
 * Se BRAND_TEXT_ONLY=true (ou os arquivos não existirem), mostra o nome em texto.
 */
export async function Brand({ tone }: { tone: "dark" | "light" }) {
  const s = await getSettings();
  if (s.logoKey) {
    const url = await presignGet(s.logoKey, { ttl: 3600 });
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={`brand-logo ${tone === "dark" ? "uploaded" : ""}`} src={url} alt="Giro 360" />;
  }
  if (process.env.BRAND_TEXT_ONLY === "true") {
    return (
      <span className="brand-text">
        Giro <span>360</span>
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="brand-logo" src={tone === "dark" ? "/brand/giro360-logo-escuro.png" : "/brand/giro360-logo.png"} alt="Giro 360" />;
}
