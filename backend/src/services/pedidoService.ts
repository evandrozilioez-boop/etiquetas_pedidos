import { Prisma, StatusPedido } from "@prisma/client";
import { prisma } from "../config/prisma";
import { AppError } from "../utils/AppError";

export interface FiltrosPedido {
  pedido?: string;
  oc?: string;
  cliente?: string;
  cidade?: string;
  estado?: string;
  produto?: string;
  marketplace?: string;
  status?: StatusPedido;
  dataInicio?: string;
  dataFim?: string;
  busca?: string;
  pagina?: number;
  tamanhoPagina?: number;
}

export async function listarPedidos(filtros: FiltrosPedido) {
  const pagina = filtros.pagina && filtros.pagina > 0 ? filtros.pagina : 1;
  const tamanhoPagina = filtros.tamanhoPagina && filtros.tamanhoPagina > 0 ? Math.min(filtros.tamanhoPagina, 200) : 25;

  const where: Prisma.PedidoWhereInput = {
    pedido: filtros.pedido ? { contains: filtros.pedido, mode: "insensitive" } : undefined,
    oc: filtros.oc ? { contains: filtros.oc, mode: "insensitive" } : undefined,
    cliente: filtros.cliente ? { contains: filtros.cliente, mode: "insensitive" } : undefined,
    cidade: filtros.cidade ? { contains: filtros.cidade, mode: "insensitive" } : undefined,
    estado: filtros.estado ? { equals: filtros.estado, mode: "insensitive" } : undefined,
    produto: filtros.produto ? { contains: filtros.produto, mode: "insensitive" } : undefined,
    marketplace: filtros.marketplace ? { contains: filtros.marketplace, mode: "insensitive" } : undefined,
    status: filtros.status,
    dataImportacao:
      filtros.dataInicio || filtros.dataFim
        ? {
            gte: filtros.dataInicio ? new Date(filtros.dataInicio) : undefined,
            lte: filtros.dataFim ? new Date(`${filtros.dataFim}T23:59:59`) : undefined,
          }
        : undefined,
    OR: filtros.busca
      ? [
          { pedido: { contains: filtros.busca, mode: "insensitive" } },
          { oc: { contains: filtros.busca, mode: "insensitive" } },
          { cliente: { contains: filtros.busca, mode: "insensitive" } },
          { cidade: { contains: filtros.busca, mode: "insensitive" } },
          { produto: { contains: filtros.busca, mode: "insensitive" } },
          { codigoBarras: { contains: filtros.busca, mode: "insensitive" } },
        ]
      : undefined,
  };

  const [total, itens] = await Promise.all([
    prisma.pedido.count({ where }),
    prisma.pedido.findMany({
      where,
      orderBy: { dataImportacao: "desc" },
      skip: (pagina - 1) * tamanhoPagina,
      take: tamanhoPagina,
      include: {
        impressoes: { orderBy: { dataHora: "desc" }, take: 1 },
        _count: { select: { impressoes: true } },
      },
    }),
  ]);

  return {
    total,
    pagina,
    tamanhoPagina,
    totalPaginas: Math.max(1, Math.ceil(total / tamanhoPagina)),
    itens: itens.map((p) => ({
      id: p.id,
      pedido: p.pedido,
      oc: p.oc,
      produto: p.produto,
      descricao: p.descricao,
      cliente: p.cliente,
      cidade: p.cidade,
      estado: p.estado,
      volume: p.volume,
      quantidade: p.quantidade,
      marketplace: p.marketplace,
      status: p.status,
      dataImportacao: p.dataImportacao,
      ultimaImpressao: p.impressoes[0]?.dataHora ?? null,
      quantidadeImpressoes: p._count.impressoes,
    })),
  };
}

export async function obterPedidoDetalhe(id: string) {
  const pedido = await prisma.pedido.findUnique({
    where: { id },
    include: {
      impressoes: { orderBy: { dataHora: "desc" }, include: { usuario: { select: { nome: true } } } },
      historicos: { orderBy: { dataHora: "desc" }, include: { usuario: { select: { nome: true } } } },
    },
  });

  if (!pedido) {
    throw new AppError("Pedido nao encontrado", 404);
  }

  return pedido;
}
