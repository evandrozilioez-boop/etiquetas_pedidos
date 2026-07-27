import { AcaoHistorico, Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";

type Tx = Prisma.TransactionClient;

interface RegistrarHistoricoParams {
  pedidoId?: string;
  acao: AcaoHistorico;
  usuarioId?: string;
  detalhes?: string;
}

/**
 * Grava uma linha de auditoria. Aceita opcionalmente um client de transacao
 * para que a gravacao do historico participe da mesma transacao ACID da
 * acao que a originou (ex.: impressao).
 */
export async function registrarHistorico(
  params: RegistrarHistoricoParams,
  client: Tx | typeof prisma = prisma
): Promise<void> {
  await client.historico.create({
    data: {
      pedidoId: params.pedidoId,
      acao: params.acao,
      usuarioId: params.usuarioId,
      detalhes: params.detalhes,
    },
  });
}
