/** Dados FICTÍCIOS e isolados, usados apenas nos testes. */
import type { CotacaoTarifa, EntradaSimulacao, FaixaTarifa, PerfilCnpj, ProvedorTarifa, TabelaFrete } from '../src/engine';
import { d, money } from '../src/engine';

export function entradaBase(over: Partial<EntradaSimulacao> = {}): EntradaSimulacao {
  return {
    descricao: 'Produto de teste',
    categoria: { id: 'MLB-TESTE', nome: 'Categoria de teste' },
    unidadesPorVenda: 1,
    custos: { compraUnitaria: '600', freteEntradaUnitario: '0', freteEntradaIncluso: false, embalagemPorVenda: '0', embalagemInclusa: false },
    margemAlvoPct: '40',
    perfilId: 'perfil-teste',
    dataReferencia: '2026-11-27',
    logistica: 'drop_off',
    caixas: [{ quantidade: 1, pesoKg: '1', comprimentoCm: '20', larguraCm: '20', alturaCm: '20' }],
    frete: { modo: 'manual', manual: { valor: '0', origem: 'zero confirmado no teste' } },
    tarifas: { base: 'anunciado', ajustes: {} },
    promocao: { ativo: false, tipoDesconto: 'valor', desconto: '0', reembolsoML: { estado: 'nao_informado', tipo: 'valor' } },
    ads: { ativo: false, tipo: 'valor', valor: '0', base: 'anunciado' },
    devolucoes: { ativo: false, eventos: [] },
    despesasFixas: { ativo: false, itens: [] },
    tributacao: { modo: 'regime_empresa' },
    ...over,
  };
}

/** Perfil com todos os tributos em "zero confirmado". */
export function perfilZero(over: Partial<PerfilCnpj> = {}): PerfilCnpj {
  return {
    id: 'perfil-teste',
    cnpj: '00.000.000/0001-00',
    razaoSocial: 'Empresa Teste',
    regimeAtual: 'simples',
    simples: {
      descricao: 'Teste',
      vigenciaInicio: '2026-01-01',
      vigenciaFim: '2026-12-31',
      aliquotaEfetiva: { estado: 'zero_confirmado' },
      base: 'receita_vendedor',
      percentualBase: '100',
      tributosNoDAS: ['IRPJ', 'CSLL', 'PIS', 'COFINS', 'CPP', 'ICMS'],
      adicionais: [],
    },
    lucroReal: {
      descricao: 'Teste',
      vigenciaInicio: '2026-01-01',
      vigenciaFim: '2026-12-31',
      tributos: [{ id: 't1', tributo: 'ICMS', descricao: 'ICMS', aliquota: { estado: 'zero_confirmado' }, base: 'pago_comprador' }],
      creditos: [],
      provisao: { estado: 'informado', metodo: 'valor_por_venda', valor: '0', criterio: 'zero no teste' },
    },
    ...over,
  };
}

/** Provedor de tarifa com faixas conhecidas (como o modo demonstração). */
export function provedorFaixas(faixas: Record<string, FaixaTarifa[]>): ProvedorTarifa {
  return {
    nome: 'Tarifa fictícia de teste',
    demo: true,
    async faixas(p) {
      return faixas[p.tipoAnuncio] ?? null;
    },
    async cotar(p) {
      const f = faixas[p.tipoAnuncio].find((x) => d(p.preco).gte(d(x.precoMin)) && (!x.precoMax || d(p.preco).lt(d(x.precoMax))))!;
      const variavel = money(d(p.preco).mul(d(f.percentual)).div(100));
      return cot(p.tipoAnuncio, p.preco, variavel.plus(d(f.fixa)).toFixed(2), f.percentual, f.fixa, 'Tarifa fictícia de teste');
    },
  };
}

export function cot(tipo: CotacaoTarifa['tipoAnuncio'], preco: string, total: string, percentual: string, fixa: string, fonte = 'API de teste'): CotacaoTarifa {
  return { tipoAnuncio: tipo, precoConsultado: preco, total, percentual, fixa, fonte, consultadoEm: '2026-11-27T12:00:00.000Z' };
}

/** Provedor tipo API: só responde preço a preço (regra fora do ponto desconhecida). */
export function provedorAPI(regra: (preco: number, tipo: string) => { percentual: string; fixa: string }) {
  const chamadas: string[] = [];
  const prov: ProvedorTarifa = {
    nome: 'API de teste',
    demo: false,
    async cotar(p) {
      chamadas.push(p.preco);
      const r = regra(Number(p.preco), p.tipoAnuncio);
      const total = money(d(p.preco).mul(d(r.percentual)).div(100)).plus(d(r.fixa));
      return cot(p.tipoAnuncio, p.preco, total.toFixed(2), r.percentual, r.fixa);
    },
  };
  return { prov, chamadas };
}

export const provedorIndisponivel: ProvedorTarifa = {
  nome: 'API de teste',
  demo: false,
  async cotar() {
    throw new Error('HTTP 503 Service Unavailable');
  },
};

export function tabelaFrete(over: Partial<TabelaFrete> = {}): TabelaFrete {
  return {
    id: 'tab-teste',
    nome: 'Tabela de teste',
    fonte: 'Fictícia — testes',
    vigenciaInicio: '2026-01-01',
    vigenciaFim: '2026-12-31',
    logisticas: ['drop_off'],
    baseFaixaPreco: 'anunciado',
    unidades: { peso: 'kg', dimensao: 'cm' },
    pesoCubico: { aplicar: false },
    arredondamentoPeso: 'nenhum',
    regraVolumes: 'por_volume',
    linhas: [
      { precoMin: '0', pesoMin: '0', pesoMax: '10', custo: '40' },
      { precoMin: '0', pesoMin: '10', pesoMax: '30', custo: '70' },
      { precoMin: '0', pesoMin: '30', custo: '120' },
    ],
    ...over,
  };
}
