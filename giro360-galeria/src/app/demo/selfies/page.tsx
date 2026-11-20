import { notFound } from "next/navigation";
import { GuestShell } from "@/components/guest/GuestShell";
import { isMockFaces } from "@/lib/config";
import { MOCK_PERSONAS } from "@/lib/faces/mock";

export const dynamic = "force-dynamic";

export default function DemoSelfies() {
  if (!isMockFaces()) notFound();
  return (
    <GuestShell>
      <div className="wrap">
        <div className="gbody">
          <div className="gcard">
            <h2>Selfies de teste</h2>
            <p>
              No modo demonstração o reconhecimento é simulado: cada “pessoa” fictícia tem um rosto de cor diferente. Salve uma destas imagens no celular e
              use “Escolher uma foto” na galeria do evento. Você também pode apontar a câmera para esta tela.
            </p>
          </div>
          <div className="grid">
            {MOCK_PERSONAS.map((p) => (
              <a key={p.id} className="tile" href={`/api/demo/selfie/${p.id}`} download={`selfie-${p.name}.jpg`} aria-label={`Selfie de teste: ${p.name}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/demo/selfie/${p.id}`} alt="" />
                <span className="badge">{p.name}</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </GuestShell>
  );
}
