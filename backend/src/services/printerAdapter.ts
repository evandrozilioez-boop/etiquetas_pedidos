import net from "net";
import { env } from "../config/env";

export interface ResultadoEnvioImpressora {
  sucesso: boolean;
  mensagemErro?: string;
}

/**
 * Envia o ZPL para a impressora. Dois adaptadores:
 *  - "mock": nao depende de hardware, usado em desenvolvimento/homologacao.
 *  - "network": envia via socket TCP bruto (porta 9100, padrao de impressoras
 *    Zebra/ZPL em rede), repetindo o payload conforme o numero de copias.
 *
 * O envio ocorre FORA da transacao de banco (I/O de rede nao deve segurar
 * locks de banco); o resultado retornado aqui e o que sera persistido de
 * forma atomica em seguida, garantindo que o banco reflita exatamente o que
 * aconteceu no envio.
 */
export async function enviarZplParaImpressora(
  zpl: string,
  impressora: string | undefined,
  copias: number
): Promise<ResultadoEnvioImpressora> {
  if (env.printAdapter === "mock") {
    return { sucesso: true };
  }

  if (!impressora) {
    return { sucesso: false, mensagemErro: "Impressora nao informada" };
  }

  const [host, portaStr] = impressora.split(":");
  const porta = Number(portaStr ?? 9100);

  if (!host || Number.isNaN(porta)) {
    return { sucesso: false, mensagemErro: `Endereco de impressora invalido: ${impressora}` };
  }

  return new Promise<ResultadoEnvioImpressora>((resolve) => {
    const socket = new net.Socket();
    const payload = zpl.repeat(Math.max(1, copias));

    const timeout = setTimeout(() => {
      socket.destroy();
      resolve({ sucesso: false, mensagemErro: "Tempo limite ao conectar na impressora" });
    }, 5000);

    socket.connect(porta, host, () => {
      socket.write(payload, (err) => {
        clearTimeout(timeout);
        if (err) {
          resolve({ sucesso: false, mensagemErro: err.message });
        } else {
          resolve({ sucesso: true });
        }
        socket.end();
      });
    });

    socket.on("error", (err) => {
      clearTimeout(timeout);
      resolve({ sucesso: false, mensagemErro: err.message });
    });
  });
}
