import type { Metadata } from "next";
import { GuestShell } from "@/components/guest/GuestShell";
import { RemovalForm } from "@/components/guest/RemovalForm";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Privacidade" };

/**
 * TEXTO PROVISÓRIO — precisa de revisão jurídica da Giro antes do uso com convidados reais (ver docs/privacidade.md).
 */
export default async function Privacy({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const s = await getSettings();
  const { e } = await searchParams;
  return (
    <GuestShell>
      <div className="wrap">
        <div className="gbody">
          <div className="gcard">
            <h2>Como cuidamos das suas imagens</h2>
            <ul className="howto">
              <li><b>1</b><span>As fotos e vídeos ficam em armazenamento privado. Cada visualização ou download usa um link temporário, liberado só para quem tem acesso ao evento.</span></li>
              <li><b>2</b><span>A busca por selfie só funciona em eventos em que a produção registrou a autorização dos participantes, e fica disponível por 90 dias após o evento. Depois disso, os dados de reconhecimento facial do evento são apagados.</span></li>
              <li><b>3</b><span>A selfie enviada para a busca é usada só naquele momento e descartada. Ela não é salva na galeria nem em cópias de segurança.</span></li>
              <li><b>4</b><span>Os resultados são sugestões de correspondência. Uma foto enviada pode ser de outra pessoa, por isso o acesso ao evento exige código quando o álbum é privado.</span></li>
              <li><b>5</b><span>Só aparecem no portfólio público da Giro 360 imagens com autorização de uso de imagem para divulgação.</span></li>
            </ul>
          </div>
          <div className="gcard">
            <h2>Pedir remoção</h2>
            <p>Se você aparece em uma foto ou vídeo e quer que ele seja removido, envie o pedido abaixo ou escreva para {s.removalContact}.</p>
            <RemovalForm eventToken={e ?? null} />
          </div>
        </div>
      </div>
    </GuestShell>
  );
}
