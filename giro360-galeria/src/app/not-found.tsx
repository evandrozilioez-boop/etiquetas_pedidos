import Link from "next/link";

export default function NotFound() {
  return (
    <div className="guest on-dark">
      <div className="wrap">
        <div className="gbody">
          <div className="gcard">
            <h2>Página não encontrada</h2>
            <p>Confira o link ou o QR Code. Se precisar de ajuda, fale com a equipe da Giro 360.</p>
            <Link className="btn primary" href="/portfolio">Ver portfólio</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
