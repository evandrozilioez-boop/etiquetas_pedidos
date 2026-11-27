/**
 * Tipos do motor de precificação. Todos os valores numéricos de entrada são
 * strings com ponto decimal ("1234.56") para evitar ponto flutuante.
 * Percentuais são informados em pontos percentuais ("40" = 40 %).
 */

export type TipoAnuncio = 'gold_special' | 'gold_pro';
export const NOME_TIPO_ANUNCIO: Record<TipoAnuncio, string> = {
  gold_special: 'Clássico',
  gold_pro: 'Premium',
};

/** logistic_type aceitos pela API listing_prices (documentação MLB). */
export type Logistica =
  | 'drop_off'
  | 'xd_drop_off'
  | 'cross_docking'
  | 'self_service'
  | 'turbo'
  | 'fulfillment'
  | 'default'
  | 'custom'
  | 'not_specified';

export const LOGISTICAS: Record<Logistica, { nome: string; shippingMode: string }> = {
  drop_off: { nome: 'Mercado Envios Drop Off', shippingMode: 'me2' },
  xd_drop_off: { nome: 'Mercado Envios Places (Agências)', shippingMode: 'me2' },
  cross_docking: { nome: 'Mercado Envios Coleta', shippingMode: 'me2' },
  self_service: { nome: 'Mercado Envios Flex', shippingMode: 'me2' },
  turbo: { nome: 'Mercado Envios Turbo', shippingMode: 'me2' },
  fulfillment: { nome: 'Mercado Envios Full', shippingMode: 'me2' },
  default: { nome: 'Mercado Envios 1 (logística própria)', shippingMode: 'me1' },
  custom: { nome: 'Envio personalizado', shippingMode: 'custom' },
  not_specified: { nome: 'Não especificado', shippingMode: 'not_specified' },
};

/** Bases de preço possíveis. Margem sempre usa receita_vendedor. */
export type BasePreco = 'anunciado' | 'pago_comprador' | 'receita_vendedor';
export const NOME_BASE: Record<BasePreco, string> = {
  anunciado: 'preço anunciado',
  pago_comprador: 'valor pago pelo comprador',
  receita_vendedor: 'receita do vendedor',
};

/** Estado de um parâmetro: diferencia zero confirmado, não se aplica e não informado. */
export type EstadoParametro = 'informado' | 'zero_confirmado' | 'nao_se_aplica' | 'nao_informado';
export interface Parametro {
  estado: EstadoParametro;
  valor?: string;
}

// ---------------------------------------------------------------- Caixas e frete

export interface Caixa {
  quantidade: number; // caixas iguais
  pesoKg: string;
  comprimentoCm: string;
  larguraCm: string;
  alturaCm: string;
}

export type RegraVolumes = 'por_volume' | 'conjunto' | 'nao_aceita';
export type ArredondamentoPeso = 'nenhum' | 'cima_0.1' | 'cima_0.5' | 'cima_1';

export interface LinhaFrete {
  precoMin: string; // inclusivo
  precoMax?: string; // exclusivo; vazio = sem limite
  pesoMin: string; // exclusivo (0 inclui 0)
  pesoMax?: string; // inclusivo; vazio = sem limite
  regiao?: string; // vazio = qualquer região
  custo: string; // custo do frete que cabe ao vendedor
}

export interface TabelaFrete {
  id: string;
  nome: string;
  fonte: string;
  vigenciaInicio: string; // YYYY-MM-DD
  vigenciaFim?: string;
  logisticas: Logistica[];
  baseFaixaPreco: BasePreco;
  unidades: { peso: 'kg'; dimensao: 'cm' };
  pesoCubico: { aplicar: boolean; divisor?: string };
  arredondamentoPeso: ArredondamentoPeso;
  regraVolumes: RegraVolumes;
  limites?: { maiorLadoCm?: string; somaLadosCm?: string; pesoMaxKg?: string; maxVolumes?: number };
  linhas: LinhaFrete[];
  demo?: boolean;
  observacoes?: string;
}

export interface FreteEntrada {
  modo: 'tabela' | 'manual';
  tabelaId?: string;
  regiao?: string;
  manual?: { valor: string; origem: string };
}

// ---------------------------------------------------------------- Tarifas

export type EscopoAjuste = 'total' | 'percentual' | 'fixa';
export interface AjusteTarifa {
  escopo: EscopoAjuste;
  tipo: 'percentual' | 'valor';
  valor: string;
  motivo?: string;
}

/** Cotação de tarifa (formato normalizado da API listing_prices). */
export interface CotacaoTarifa {
  tipoAnuncio: TipoAnuncio;
  precoConsultado: string; // preço enviado em `price`
  total: string; // sale_fee_amount (total da tarifa de venda)
  percentual: string; // sale_fee_details.percentage_fee (pontos percentuais)
  fixa: string; // sale_fee_details.fixed_fee (já incluída no total)
  financiamento?: string; // sale_fee_details.financing_add_on_fee (já incluído no percentual)
  fonte: string;
  consultadoEm: string; // ISO
  demo?: boolean;
  cache?: boolean;
}

/** Faixa conhecida de tarifa (usada por tabelas demo ou regras manuais completas). */
export interface FaixaTarifa {
  precoMin: string;
  precoMax?: string;
  percentual: string;
  fixa: string;
}

/**
 * Regra de tarifa usada pelo motor para um tipo de anúncio.
 *  - faixas conhecidas: o motor conhece a tarifa para qualquer preço (mínimo comprovável);
 *  - cotação pontual: regra observada num preço; validade fora dele é desconhecida.
 */
export interface RegraTarifa {
  tipoAnuncio: TipoAnuncio;
  faixas?: FaixaTarifa[];
  cotacao?: CotacaoTarifa;
  ajuste?: AjusteTarifa;
  fonte: string;
}

// ---------------------------------------------------------------- Despesas

export interface Promocao {
  ativo: boolean;
  tipoDesconto: 'valor' | 'percentual';
  desconto: string;
  reembolsoML: { estado: 'informado' | 'nao_informado'; tipo: 'valor' | 'percentual_desconto'; valor?: string };
}

export interface MercadoAds {
  ativo: boolean;
  tipo: 'valor' | 'percentual';
  valor: string;
  base: BasePreco;
}

export interface EventoDevolucao {
  nome: string;
  modo: 'valor' | 'probabilidade';
  valor?: string;
  probabilidadePct?: string;
  prejuizoMedio?: string;
}

export interface DespesaFixa {
  nome: string;
  modo: 'por_venda' | 'percentual_receita' | 'mensal';
  valor: string;
  volumeMensal?: string;
}

// ---------------------------------------------------------------- Tributos

export type CodigoTributo =
  | 'IRPJ' | 'CSLL' | 'PIS' | 'COFINS' | 'CPP' | 'ICMS' | 'ICMS_ST' | 'DIFAL' | 'IPI' | 'ISS' | 'IBS' | 'CBS' | 'OUTRO';

export interface Incidencia {
  id: string;
  tributo: CodigoTributo;
  descricao: string;
  aliquota: Parametro; // pontos percentuais
  base: BasePreco;
  jaIncluidoNoCusto?: boolean;
}

export interface Credito {
  id: string;
  tributo: CodigoTributo;
  descricao: string;
  tipo: 'percentual' | 'valor';
  valor: Parametro;
  /** percentual aplicado sobre o custo de compra (compra unitária × unidades). */
  base: 'custo_compra';
  jaAbatidoDoCusto: boolean;
}

export interface ParamSimples {
  descricao: string;
  vigenciaInicio: string;
  vigenciaFim?: string;
  aliquotaEfetiva: Parametro;
  base: BasePreco;
  percentualBase: string; // parcela da base sujeita ao DAS nesta operação
  tributosNoDAS: CodigoTributo[];
  adicionais: Incidencia[];
  observacoes?: string;
}

export interface ProvisaoIR {
  estado: 'informado' | 'nao_informado';
  metodo?: 'percentual_resultado' | 'percentual_receita' | 'valor_por_venda';
  valor?: string;
  criterio?: string;
}

export interface ParamLucroReal {
  descricao: string;
  vigenciaInicio: string;
  vigenciaFim?: string;
  tributos: Incidencia[];
  creditos: Credito[];
  provisao: ProvisaoIR;
  observacoes?: string;
}

export interface PerfilCnpj {
  id: string;
  cnpj: string;
  razaoSocial: string;
  regimeAtual: 'simples' | 'lucro_real';
  simples?: ParamSimples;
  lucroReal?: ParamLucroReal;
  demo?: boolean;
}

export type Regime = 'simples' | 'lucro_real';
export const NOME_REGIME: Record<Regime, string> = { simples: 'Simples Nacional', lucro_real: 'Lucro Real' };

// ---------------------------------------------------------------- Simulação

export interface EntradaSimulacao {
  descricao?: string;
  categoria?: { id: string; nome?: string } | null;
  unidadesPorVenda: number;
  custos: {
    compraUnitaria: string;
    freteEntradaUnitario: string;
    freteEntradaIncluso: boolean;
    embalagemPorVenda: string;
    embalagemInclusa: boolean;
  };
  margemAlvoPct: string;
  perfilId?: string;
  dataReferencia: string;
  logistica: Logistica;
  caixas: Caixa[];
  frete: FreteEntrada;
  tarifas: {
    base: BasePreco;
    ajustes: Partial<Record<TipoAnuncio, AjusteTarifa>>;
  };
  promocao: Promocao;
  ads: MercadoAds;
  devolucoes: { ativo: boolean; eventos: EventoDevolucao[] };
  despesasFixas: { ativo: boolean; itens: DespesaFixa[] };
  tributacao: { modo: 'regime_empresa' | 'comparar' };
}

// ---------------------------------------------------------------- Resultado

export interface LinhaMemoria {
  chave: string;
  rotulo: string;
  valor: string; // R$ com sinal: negativos são deduções
  detalhe?: string;
  fonte?: string;
  manual?: boolean;
  tipo?: 'subtotal' | 'informativo' | 'deducao' | 'acrescimo' | 'resultado';
}

export interface DetalheCaixa {
  indice: number;
  quantidade: number;
  pesoRealKg: string;
  pesoCubicoKg?: string;
  pesoFaturavelKg: string;
  dimensoes: string;
  enquadramento?: string;
  custoUnitario?: string;
}

export interface DetalheFrete {
  origem: 'tabela' | 'manual';
  regra: string;
  total: string;
  fonte: string;
  vigencia?: string;
  caixas: DetalheCaixa[];
  demo?: boolean;
}

export interface Avaliacao {
  preco: string;
  precoPagoComprador: string;
  receitaVendedor: string;
  baseTarifa: string;
  tarifa: string;
  frete: string;
  repasseML: string;
  custoAquisicao: string;
  tributosLiquidos: string;
  ads: string;
  devolucoes: string;
  despesasFixas: string;
  resultadoAntesProvisao: string;
  provisao: string | null; // null = critério pendente
  resultado: string; // gerencial (antes da provisão se pendente)
  margemPct: string;
  memoria: LinhaMemoria[];
  frete_detalhe: DetalheFrete;
  avisos: string[];
}

export type StatusPreco =
  | 'minimo_comprovado'
  | 'validado'
  | 'inviavel'
  | 'pendente';

export interface ResultadoCenario {
  tipoAnuncio: TipoAnuncio;
  regime: Regime;
  status: StatusPreco;
  mensagem: string;
  pendencias: string[];
  avisos: string[];
  margemFinalPendente: boolean;
  avaliacao?: Avaliacao;
  tarifaInfo?: {
    fonte: string;
    consultado?: CotacaoTarifa;
    ajuste?: AjusteTarifa;
    consultas: number;
  };
  diagnostico?: string[];
}

// ---------------------------------------------------------------- Produtos salvos

/** Item salvo pelo usuário: os dados da simulação (custos, caixas, categoria) e o histórico de custo. */
export interface Produto {
  id: string;
  nome: string;
  sku?: string;
  /** Simulação como foi digitada na tela (números em pt-BR). */
  simulacao: EntradaSimulacao;
  historicoCusto: { data: string; custoCompra: string }[];
  ultimoResultado?: {
    calculadoEm: string;
    margemAlvoPct: string;
    custoCompra: string;
    precos: { tipoAnuncio: TipoAnuncio; regime: Regime; preco?: string; resultado?: string; margemPct?: string; status: StatusPreco }[];
    demo: boolean;
  };
  criadoEm: string;
  atualizadoEm: string;
}
