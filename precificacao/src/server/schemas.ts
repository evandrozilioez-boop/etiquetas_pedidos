import { z } from 'zod';

const num = z.string().regex(/^-?\d+(\.\d+)?$/, 'número com ponto decimal');
const data = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data AAAA-MM-DD');
const base = z.enum(['anunciado', 'pago_comprador', 'receita_vendedor']);
const tributo = z.enum(['IRPJ', 'CSLL', 'PIS', 'COFINS', 'CPP', 'ICMS', 'ICMS_ST', 'DIFAL', 'IPI', 'ISS', 'IBS', 'CBS', 'OUTRO']);
const logistica = z.enum(['drop_off', 'xd_drop_off', 'cross_docking', 'self_service', 'turbo', 'fulfillment', 'default', 'custom', 'not_specified']);

const parametro = z
  .object({ estado: z.enum(['informado', 'zero_confirmado', 'nao_se_aplica', 'nao_informado']), valor: num.optional() })
  .refine((p) => p.estado !== 'informado' || p.valor !== undefined, 'valor obrigatório quando o estado é "informado"');

const incidencia = z.object({
  id: z.string().min(1),
  tributo,
  descricao: z.string(),
  aliquota: parametro,
  base,
  jaIncluidoNoCusto: z.boolean().optional(),
});

export const perfilSchema = z.object({
  id: z.string().min(1),
  cnpj: z.string().min(1, 'CNPJ obrigatório'),
  razaoSocial: z.string().min(1, 'razão social obrigatória'),
  regimeAtual: z.enum(['simples', 'lucro_real']),
  demo: z.boolean().optional(),
  simples: z
    .object({
      descricao: z.string(),
      vigenciaInicio: data,
      vigenciaFim: data.optional(),
      aliquotaEfetiva: parametro,
      base,
      percentualBase: num,
      tributosNoDAS: z.array(tributo),
      adicionais: z.array(incidencia),
      observacoes: z.string().optional(),
    })
    .optional(),
  lucroReal: z
    .object({
      descricao: z.string(),
      vigenciaInicio: data,
      vigenciaFim: data.optional(),
      tributos: z.array(incidencia),
      creditos: z.array(
        z.object({
          id: z.string().min(1),
          tributo,
          descricao: z.string(),
          tipo: z.enum(['percentual', 'valor']),
          valor: parametro,
          base: z.literal('custo_compra'),
          jaAbatidoDoCusto: z.boolean(),
        }),
      ),
      provisao: z.object({
        estado: z.enum(['informado', 'nao_informado']),
        metodo: z.enum(['percentual_resultado', 'percentual_receita', 'valor_por_venda']).optional(),
        valor: num.optional(),
        criterio: z.string().optional(),
      }),
      observacoes: z.string().optional(),
    })
    .optional(),
});

export const tabelaSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(1, 'nome obrigatório'),
  fonte: z.string().min(1, 'fonte obrigatória'),
  vigenciaInicio: data,
  vigenciaFim: data.optional(),
  logisticas: z.array(logistica).min(1, 'informe ao menos uma modalidade'),
  baseFaixaPreco: base,
  unidades: z.object({ peso: z.literal('kg'), dimensao: z.literal('cm') }),
  pesoCubico: z.object({ aplicar: z.boolean(), divisor: num.optional() }).refine((p) => !p.aplicar || !!p.divisor, 'divisor obrigatório para peso cúbico'),
  arredondamentoPeso: z.enum(['nenhum', 'cima_0.1', 'cima_0.5', 'cima_1']),
  regraVolumes: z.enum(['por_volume', 'conjunto', 'nao_aceita']),
  limites: z
    .object({ maiorLadoCm: num.optional(), somaLadosCm: num.optional(), pesoMaxKg: num.optional(), maxVolumes: z.number().int().positive().optional() })
    .optional(),
  linhas: z
    .array(z.object({ precoMin: num, precoMax: num.optional(), pesoMin: num, pesoMax: num.optional(), regiao: z.string().optional(), custo: num }))
    .min(1, 'a tabela precisa de ao menos uma faixa'),
  demo: z.boolean().optional(),
  observacoes: z.string().optional(),
});

/** Validação estrutural da simulação; regras de negócio e pendências ficam no motor. */
export const entradaSchema = z
  .object({
    unidadesPorVenda: z.number(),
    custos: z.object({}).passthrough(),
    margemAlvoPct: z.string(),
    dataReferencia: z.string(),
    logistica,
    caixas: z.array(z.object({}).passthrough()),
    frete: z.object({ modo: z.enum(['tabela', 'manual']) }).passthrough(),
    tarifas: z.object({ base, ajustes: z.object({}).passthrough() }),
    promocao: z.object({ ativo: z.boolean() }).passthrough(),
    ads: z.object({ ativo: z.boolean() }).passthrough(),
    devolucoes: z.object({ ativo: z.boolean(), eventos: z.array(z.any()) }),
    despesasFixas: z.object({ ativo: z.boolean(), itens: z.array(z.any()) }),
    tributacao: z.object({ modo: z.enum(['regime_empresa', 'comparar']) }),
  })
  .passthrough();
