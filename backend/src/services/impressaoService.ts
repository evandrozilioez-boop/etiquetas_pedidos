import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";
import { registrarHistorico } from "./historicoService";
import { enviarZplParaImpressora } from "./printerAdapter";

interface ImprimirParams {
  pedidoId: string;
  usuarioId: string;
  impressora?: string;
  ipMaquina?: string;
  copias?: number;
  reimpressao: boolean;
}

const STATUS_QUE_IMPEDEM_IMPRESSAO = new Set(["CANCELADO"]);

export async function imprimirPedido(params: ImprimirParams) {
  const { pedidoId, usuarioId, impressora, ipMaquina, reimpressao } = params;
  const copias = params.copias && params.copias > 0 ? params.copias : 1;

  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } });
  if (!pedido) {
    throw new AppError("Pedido nao encontrado", 404);
  }

  if (STATUS_QUE_IMPEDEM_IMPRESSAO.has(pedido.status)) {
    throw new AppError("Pedido cancelado nao pode ser impresso", 409);
  }

  const jaImpresso = pedido.status === "IMPRESSO" || pedido.status === "REIMPRESSO";
  if (jaImpresso && !reimpressao) {
    throw new AppError("Pedido ja impresso. Utilize a opcao de reimpressao.", 409);
  }
  if (!jaImpresso && reimpressao) {
    throw new AppError("Pedido ainda nao foi impresso. Utilize a opcao de imprimir.", 409);
  }

  // Envio de rede acontece fora da transacao de banco; o resultado e persistido
  // de forma atomica logo em seguida (Impressoes + Pedidos + Historico).
  const resultadoEnvio = await enviarZplParaImpressora(pedido.zplOriginal, impressora, copias);

  return prisma.$transaction(async (tx) => {
    const impressao = await tx.impressao.create({
      data: {
        pedidoId,
        usuarioId,
        impressora,
        ipMaquina,
        copias,
        resultado: resultadoEnvio.sucesso ? "SUCESSO" : "ERRO",
        mensagemErro: resultadoEnvio.mensagemErro,
      },
    });

    if (resultadoEnvio.sucesso) {
      await tx.pedido.update({
        where: { id: pedidoId },
        data: { status: reimpressao ? "REIMPRESSO" : "IMPRESSO" },
      });

      await registrarHistorico(
        {
          pedidoId,
          usuarioId,
          acao: reimpressao ? "REIMPRESSAO" : "IMPRESSAO",
          detalhes: `Copias: ${copias}${impressora ? `, impressora: ${impressora}` : ""}`,
        },
        tx
      );
    } else {
      // Status permanece inalterado em caso de erro; apenas o historico registra a falha.
      await registrarHistorico(
        {
          pedidoId,
          usuarioId,
          acao: "ERRO_IMPRESSAO",
          detalhes: resultadoEnvio.mensagemErro ?? "Falha desconhecida no envio para impressora",
        },
        tx
      );
    }

    return {
      sucesso: resultadoEnvio.sucesso,
      mensagemErro: resultadoEnvio.mensagemErro,
      impressao,
    };
  });
}

export async function cancelarPedido(pedidoId: string, usuarioId: string, motivo?: string) {
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } });
  if (!pedido) {
    throw new AppError("Pedido nao encontrado", 404);
  }

  return prisma.$transaction(async (tx) => {
    await tx.pedido.update({ where: { id: pedidoId }, data: { status: "CANCELADO" } });
    await registrarHistorico(
      { pedidoId, usuarioId, acao: "CANCELAMENTO", detalhes: motivo },
      tx
    );
  });
}

export async function expedirPedido(pedidoId: string, usuarioId: string) {
  const pedido = await prisma.pedido.findUnique({ where: { id: pedidoId } });
  if (!pedido) {
    throw new AppError("Pedido nao encontrado", 404);
  }
  if (pedido.status !== "IMPRESSO" && pedido.status !== "REIMPRESSO") {
    throw new AppError("Somente pedidos impressos podem ser expedidos", 409);
  }

  return prisma.$transaction(async (tx) => {
    await tx.pedido.update({ where: { id: pedidoId }, data: { status: "EXPEDIDO" } });
    await registrarHistorico({ pedidoId, usuarioId, acao: "EXPEDICAO" }, tx);
  });
}
