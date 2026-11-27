/**
 * DADOS FICTÍCIOS DO MODO DEMONSTRAÇÃO.
 * Nada aqui é tarifa, frete ou parâmetro fiscal real. Esses dados só são
 * carregados quando o servidor está em modo demonstração e o motor recusa
 * tabelas/perfis marcados como `demo` fora desse modo.
 */
import type { CotacaoTarifa, FaixaTarifa, PerfilCnpj, TabelaFrete } from '../engine';
import { d, money } from '../engine';
import type { ParamConsulta, ProvedorTarifa } from '../engine/simulate';

const FONTE = 'DEMONSTRAÇÃO — tarifa fictícia (não é valor do Mercado Livre)';

/** Faixas fictícias. A estrutura imita a lógica documentada (tarifa fixa abaixo de um limite só para Flex/ME1). */
function faixasDemo(p: ParamConsulta): FaixaTarifa[] {
  const pctBase = p.tipoAnuncio === 'gold_pro' ? '16.5' : '11.5';
  const cobraFixa = ['self_service', 'default', 'custom', 'not_specified'].includes(p.logistica);
  return [
    { precoMin: '0', precoMax: '79', percentual: pctBase, fixa: cobraFixa ? '6.25' : '0' },
    { precoMin: '79', percentual: pctBase, fixa: '0' },
  ];
}

export const provedorDemo: ProvedorTarifa = {
  nome: FONTE,
  demo: true,
  async faixas(p) {
    return faixasDemo(p);
  },
  async cotar(p): Promise<CotacaoTarifa> {
    const preco = d(p.preco);
    const f = faixasDemo(p).find((x) => preco.gte(d(x.precoMin)) && (!x.precoMax || preco.lt(d(x.precoMax))))!;
    const variavel = money(preco.mul(d(f.percentual)).div(100));
    return {
      tipoAnuncio: p.tipoAnuncio,
      precoConsultado: preco.toFixed(2),
      total: variavel.plus(d(f.fixa)).toFixed(2),
      percentual: f.percentual,
      fixa: f.fixa,
      financiamento: '0',
      fonte: FONTE,
      consultadoEm: new Date().toISOString(),
      demo: true,
    };
  },
};

export const tabelaDemo: TabelaFrete = {
  id: 'demo-tabela',
  nome: 'Tabela DEMONSTRAÇÃO (fictícia)',
  fonte: 'Valores inventados para testar o app — substitua pela tabela oficial ou pela sua',
  vigenciaInicio: '2026-01-01',
  vigenciaFim: '2027-12-31',
  logisticas: ['drop_off', 'xd_drop_off', 'cross_docking'],
  baseFaixaPreco: 'pago_comprador',
  unidades: { peso: 'kg', dimensao: 'cm' },
  pesoCubico: { aplicar: true, divisor: '6000' },
  arredondamentoPeso: 'cima_0.1',
  regraVolumes: 'por_volume',
  limites: { maiorLadoCm: '200', somaLadosCm: '300', pesoMaxKg: '50', maxVolumes: 4 },
  linhas: [
    { precoMin: '0', precoMax: '79', pesoMin: '0', custo: '0' },
    { precoMin: '79', pesoMin: '0', pesoMax: '0.5', custo: '19.90' },
    { precoMin: '79', pesoMin: '0.5', pesoMax: '2', custo: '24.90' },
    { precoMin: '79', pesoMin: '2', pesoMax: '5', custo: '34.90' },
    { precoMin: '79', pesoMin: '5', pesoMax: '10', custo: '49.90' },
    { precoMin: '79', pesoMin: '10', pesoMax: '20', custo: '74.90' },
    { precoMin: '79', pesoMin: '20', pesoMax: '30', custo: '99.90' },
    { precoMin: '79', pesoMin: '30', pesoMax: '50', custo: '139.90' },
  ],
  demo: true,
  observacoes: 'Abaixo de R$ 79 (valor pago pelo comprador) o frete fictício fica com o comprador.',
};

export const perfilDemo: PerfilCnpj = {
  id: 'demo-perfil',
  cnpj: '00.000.000/0000-00',
  razaoSocial: 'Empresa DEMONSTRAÇÃO (parâmetros fictícios)',
  regimeAtual: 'simples',
  demo: true,
  simples: {
    descricao: 'Fictício para demonstração — substitua pelo parâmetro do seu contador',
    vigenciaInicio: '2026-01-01',
    vigenciaFim: '2027-12-31',
    aliquotaEfetiva: { estado: 'informado', valor: '7.3' },
    base: 'receita_vendedor',
    percentualBase: '100',
    tributosNoDAS: ['IRPJ', 'CSLL', 'PIS', 'COFINS', 'CPP', 'ICMS'],
    adicionais: [{ id: 'demo-difal', tributo: 'DIFAL', descricao: 'DIFAL fictício', aliquota: { estado: 'nao_se_aplica' }, base: 'pago_comprador' }],
  },
  lucroReal: {
    descricao: 'Fictício para demonstração — substitua pelo parâmetro do seu contador',
    vigenciaInicio: '2026-01-01',
    vigenciaFim: '2027-12-31',
    tributos: [
      { id: 'demo-icms', tributo: 'ICMS', descricao: 'ICMS fictício', aliquota: { estado: 'informado', valor: '17' }, base: 'pago_comprador' },
      { id: 'demo-pis', tributo: 'PIS', descricao: 'PIS fictício', aliquota: { estado: 'informado', valor: '1.65' }, base: 'receita_vendedor' },
      { id: 'demo-cofins', tributo: 'COFINS', descricao: 'COFINS fictício', aliquota: { estado: 'informado', valor: '7.6' }, base: 'receita_vendedor' },
    ],
    creditos: [
      { id: 'demo-cred', tributo: 'PIS', descricao: 'PIS/COFINS sobre a compra (fictício)', tipo: 'percentual', valor: { estado: 'informado', valor: '9.25' }, base: 'custo_compra', jaAbatidoDoCusto: false },
      { id: 'demo-cred-icms', tributo: 'ICMS', descricao: 'ICMS da compra (fictício)', tipo: 'percentual', valor: { estado: 'informado', valor: '12' }, base: 'custo_compra', jaAbatidoDoCusto: false },
    ],
    provisao: { estado: 'nao_informado' },
  },
};

export const categoriasDemo = [
  { id: 'MLB1626', nome: 'Sofás', caminho: 'Casa, Móveis e Decoração › Móveis › Sofás' },
  { id: 'MLB1055', nome: 'Celulares e Smartphones', caminho: 'Celulares e Telefones › Celulares e Smartphones' },
];
