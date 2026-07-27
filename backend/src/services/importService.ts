import ExcelJS from "exceljs";
import { Readable } from "stream";
import { OrigemImportacao, Prisma } from "@prisma/client";
import { prisma } from "../config/prisma";
import { sha256 } from "../utils/hash";
import { registrarHistorico } from "./historicoService";
import { extrairCamposZpl } from "./zplParser";
import { AppError } from "../utils/AppError";

export interface LinhaPedido {
  pedido: string;
  oc?: string;
  produto?: string;
  descricao?: string;
  cliente?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
  volume?: string;
  quantidade?: number;
  transportadora?: string;
  marketplace?: string;
  codigoBarras?: string;
  qrCode?: string;
  zplOriginal?: string;
}

export interface ResultadoImportacao {
  total: number;
  criados: number;
  atualizados: number;
  inalterados: number;
  erros: Array<{ linha: number; motivo: string }>;
}

// Aceita variacoes de nome de coluna (maiusculas/minusculas, acentos, espacos).
const MAPA_CABECALHOS: Record<string, keyof LinhaPedido> = {
  pedido: "pedido",
  numeropedido: "pedido",
  oc: "oc",
  ordemdecompra: "oc",
  codigoproduto: "produto",
  codproduto: "produto",
  produto: "produto",
  sku: "produto",
  descricao: "descricao",
  cliente: "cliente",
  cidade: "cidade",
  uf: "estado",
  estado: "estado",
  cep: "cep",
  volume: "volume",
  quantidade: "quantidade",
  qtd: "quantidade",
  transportadora: "transportadora",
  marketplace: "marketplace",
  codigodebarras: "codigoBarras",
  codigobarras: "codigoBarras",
  qrcode: "qrCode",
  arquivozpl: "zplOriginal",
  zpl: "zplOriginal",
  zploriginal: "zplOriginal",
};

function normalizarCabecalho(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export async function planilhaParaLinhas(buffer: Buffer, ehCsv: boolean): Promise<LinhaPedido[]> {
  const workbook = new ExcelJS.Workbook();

  if (ehCsv) {
    await workbook.csv.read(Readable.from(buffer));
  } else {
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  }

  const planilha = workbook.worksheets[0];
  if (!planilha || planilha.rowCount < 1) {
    throw new AppError("Planilha vazia ou em formato invalido", 400);
  }

  const cabecalhos: Array<keyof LinhaPedido | undefined> = [];
  const linhaCabecalho = planilha.getRow(1);
  linhaCabecalho.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    const texto = String(cell.value ?? "");
    cabecalhos[colNumber] = MAPA_CABECALHOS[normalizarCabecalho(texto)];
  });

  const linhas: LinhaPedido[] = [];
  for (let numeroLinha = 2; numeroLinha <= planilha.rowCount; numeroLinha++) {
    const row = planilha.getRow(numeroLinha);
    if (row.cellCount === 0) continue;

    const linha: Partial<LinhaPedido> = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const campo = cabecalhos[colNumber];
      if (!campo) return;

      const valorBruto = cell.value;
      if (campo === "quantidade") {
        const numero = Number(
          typeof valorBruto === "object" && valorBruto && "result" in valorBruto
            ? (valorBruto as { result: unknown }).result
            : valorBruto
        );
        linha.quantidade = Number.isNaN(numero) ? undefined : numero;
      } else {
        const texto = String(valorBruto ?? "").trim();
        if (texto) (linha[campo] as string) = texto;
      }
    });

    if (Object.keys(linha).length > 0) {
      linhas.push(linha as LinhaPedido);
    }
  }

  return linhas;
}

function calcularHash(linha: LinhaPedido): string {
  if (linha.zplOriginal && linha.zplOriginal.trim()) {
    return sha256(linha.zplOriginal.trim());
  }
  const chaveEstavel = JSON.stringify({
    pedido: linha.pedido,
    oc: linha.oc,
    produto: linha.produto,
    volume: linha.volume,
    codigoBarras: linha.codigoBarras,
  });
  return sha256(chaveEstavel);
}

async function importarLinha(
  linha: LinhaPedido,
  origem: OrigemImportacao,
  usuarioId: string
): Promise<"criado" | "atualizado" | "inalterado"> {
  if (!linha.pedido || !linha.pedido.trim()) {
    throw new AppError("Campo 'Pedido' e obrigatorio", 400);
  }

  // Se houver ZPL, tenta completar automaticamente os campos nao informados explicitamente.
  if (linha.zplOriginal) {
    const extraido = extrairCamposZpl(linha.zplOriginal);
    for (const [campo, valor] of Object.entries(extraido)) {
      const chave = campo as keyof LinhaPedido;
      if (linha[chave] === undefined || linha[chave] === "") {
        (linha[chave] as unknown) = valor;
      }
    }
  }

  const hash = calcularHash(linha);

  const duplicataExata = await prisma.pedido.findUnique({ where: { hash } });
  if (duplicataExata) {
    // Conteudo identico ja importado anteriormente - nao cria novo registro nem altera nada.
    return "inalterado";
  }

  const existente = await prisma.pedido.findFirst({
    where: {
      pedido: linha.pedido,
      oc: linha.oc ?? undefined,
      volume: linha.volume ?? undefined,
    },
  });

  const dados: Prisma.PedidoUpdateInput = {
    pedido: linha.pedido,
    oc: linha.oc,
    produto: linha.produto,
    descricao: linha.descricao,
    cliente: linha.cliente,
    cidade: linha.cidade,
    estado: linha.estado,
    cep: linha.cep,
    volume: linha.volume,
    quantidade: linha.quantidade,
    transportadora: linha.transportadora,
    marketplace: linha.marketplace,
    codigoBarras: linha.codigoBarras,
    qrCode: linha.qrCode,
    zplOriginal: linha.zplOriginal ?? existente?.zplOriginal ?? "",
    hash,
    origemImportacao: origem,
  };

  if (existente) {
    await prisma.$transaction(async (tx) => {
      // Atualiza os dados cadastrais mas preserva id, status e todo o historico/impressoes ja vinculados.
      await tx.pedido.update({ where: { id: existente.id }, data: dados });
      await registrarHistorico(
        {
          pedidoId: existente.id,
          usuarioId,
          acao: "ATUALIZACAO",
          detalhes: `Pedido reimportado (origem: ${origem}) - dados atualizados`,
        },
        tx
      );
    });
    return "atualizado";
  }

  await prisma.$transaction(async (tx) => {
    const novo = await tx.pedido.create({
      data: { ...dados, zplOriginal: linha.zplOriginal ?? "" } as Prisma.PedidoCreateInput,
    });
    await registrarHistorico(
      {
        pedidoId: novo.id,
        usuarioId,
        acao: "IMPORTACAO",
        detalhes: `Pedido importado (origem: ${origem})`,
      },
      tx
    );
  });
  return "criado";
}

export async function importarLinhas(
  linhas: LinhaPedido[],
  origem: OrigemImportacao,
  usuarioId: string
): Promise<ResultadoImportacao> {
  const resultado: ResultadoImportacao = {
    total: linhas.length,
    criados: 0,
    atualizados: 0,
    inalterados: 0,
    erros: [],
  };

  for (let i = 0; i < linhas.length; i++) {
    try {
      const status = await importarLinha(linhas[i], origem, usuarioId);
      if (status === "criado") resultado.criados++;
      else if (status === "atualizado") resultado.atualizados++;
      else resultado.inalterados++;
    } catch (err) {
      const motivo = err instanceof Error ? err.message : "Erro desconhecido";
      resultado.erros.push({ linha: i + 2, motivo }); // +2 considerando cabecalho da planilha
    }
  }

  return resultado;
}
