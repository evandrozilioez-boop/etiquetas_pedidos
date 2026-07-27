import { prisma } from "../config/prisma";

function inicioDoDia(data = new Date()): Date {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d;
}

export async function obterResumoDashboard() {
  const hoje = inicioDoDia();

  const [importadosHoje, aguardando, impressos, reimpressos, cancelados, expedidos, ultimosImpressos] =
    await Promise.all([
      prisma.pedido.count({ where: { dataImportacao: { gte: hoje } } }),
      prisma.pedido.count({ where: { status: "AGUARDANDO_IMPRESSAO" } }),
      prisma.pedido.count({ where: { status: "IMPRESSO" } }),
      prisma.pedido.count({ where: { status: "REIMPRESSO" } }),
      prisma.pedido.count({ where: { status: "CANCELADO" } }),
      prisma.pedido.count({ where: { status: "EXPEDIDO" } }),
      prisma.impressao.findMany({
        take: 10,
        orderBy: { dataHora: "desc" },
        include: {
          pedido: { select: { pedido: true, cliente: true, cidade: true } },
          usuario: { select: { nome: true } },
        },
      }),
    ]);

  const quatorzeDiasAtras = new Date(hoje);
  quatorzeDiasAtras.setDate(quatorzeDiasAtras.getDate() - 13);

  const impressoesRecentes = await prisma.impressao.findMany({
    where: { dataHora: { gte: quatorzeDiasAtras } },
    select: { dataHora: true, resultado: true },
  });

  const grafico: Record<string, { data: string; impressoes: number; erros: number }> = {};
  for (let i = 0; i < 14; i++) {
    const dia = new Date(quatorzeDiasAtras);
    dia.setDate(dia.getDate() + i);
    const chave = dia.toISOString().slice(0, 10);
    grafico[chave] = { data: chave, impressoes: 0, erros: 0 };
  }
  for (const item of impressoesRecentes) {
    const chave = item.dataHora.toISOString().slice(0, 10);
    if (!grafico[chave]) continue;
    if (item.resultado === "SUCESSO") grafico[chave].impressoes++;
    else grafico[chave].erros++;
  }

  return {
    importadosHoje,
    aguardando,
    impressos,
    reimpressos,
    cancelados,
    expedidos,
    graficoDiario: Object.values(grafico),
    ultimosImpressos: ultimosImpressos.map((i) => ({
      id: i.id,
      pedido: i.pedido.pedido,
      cliente: i.pedido.cliente,
      cidade: i.pedido.cidade,
      usuario: i.usuario?.nome ?? "N/D",
      dataHora: i.dataHora,
      resultado: i.resultado,
    })),
  };
}
