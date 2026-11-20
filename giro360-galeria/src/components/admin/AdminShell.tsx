import Link from "next/link";
import { isMockFaces, facesAvailable } from "@/lib/config";
import { LogoutButton } from "./LogoutButton";

export function AdminShell({ children, current }: { children: React.ReactNode; current: "eventos" | "novo" | "enviar" | "config" }) {
  const nav: [typeof current, string, string][] = [
    ["eventos", "/admin", "Eventos"],
    ["novo", "/admin/eventos/novo", "Novo evento"],
    ["enviar", "/admin/enviar", "Enviar arquivos"],
    ["config", "/admin/configuracoes", "Configurações"],
  ];
  return (
    <div className="admin">
      <header className="ahead">
        <div className="wrap">
          <Link className="alogo" href="/admin">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="on-light-logo" src="/brand/giro360-logo.png" alt="Giro 360" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="on-dark-logo" src="/brand/giro360-logo-escuro.png" alt="" />
            <small className="muted">Operação</small>
          </Link>
          <nav className="anav" aria-label="Painel">
            {nav.map(([k, href, label]) => (
              <Link key={k} href={href} aria-current={current === k ? "page" : undefined}>
                {label}
              </Link>
            ))}
            <LogoutButton />
          </nav>
        </div>
      </header>
      <div className="wrap">
        <main className="amain">
          {isMockFaces() && <div className="demo-flag">Modo simulado: o reconhecimento facial é de demonstração. Este modo é bloqueado em produção.</div>}
          {!facesAvailable() && <div className="demo-flag" style={{ background: "var(--info-soft)", color: "var(--info)" }}>Reconhecimento facial não configurado: galeria, QR individual e downloads funcionam normalmente; a busca por selfie fica indisponível.</div>}
          {children}
        </main>
      </div>
    </div>
  );
}
