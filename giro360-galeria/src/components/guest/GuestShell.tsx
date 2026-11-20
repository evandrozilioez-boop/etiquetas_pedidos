import Link from "next/link";
import { Brand } from "../Brand";
import { isMockFaces } from "@/lib/config";
import { getSettings } from "@/lib/settings";

/** Moldura escura comum às páginas públicas: logo, aviso de modo demonstração e rodapé com canal de remoção. */
export async function GuestShell({ children, right, footNote }: { children: React.ReactNode; right?: React.ReactNode; footNote?: React.ReactNode }) {
  const s = await getSettings();
  return (
    <div className="guest on-dark">
      {isMockFaces() && <div className="demo-banner wrap">Modo demonstração: reconhecimento facial simulado, não usar com convidados reais</div>}
      <div className="wrap brandbar">
        <Link href="/portfolio" aria-label="Giro 360 — portfólio">
          <Brand tone="dark" />
        </Link>
        {right}
      </div>
      {children}
      <div className="foot wrap">
        {footNote}
        {footNote ? <br /> : null}
        Quer remover uma imagem sua? Escreva para <span style={{ userSelect: "all" }}>{s.removalContact}</span> ou use a{" "}
        <Link href="/privacidade">página de privacidade</Link>.
      </div>
    </div>
  );
}
