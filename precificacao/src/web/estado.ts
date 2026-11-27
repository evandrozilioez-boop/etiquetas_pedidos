import type { AjusteTarifa, EntradaSimulacao } from '../engine/types';
import { deBR, hojeISO } from './format';

/** O formulário usa o mesmo formato da simulação, mas com números digitados em pt-BR ("1.234,56"). */
export type FormSim = EntradaSimulacao;

export function formInicial(): FormSim {
  return {
    descricao: '',
    categoria: null,
    unidadesPorVenda: 1,
    custos: { compraUnitaria: '', freteEntradaUnitario: '', freteEntradaIncluso: false, embalagemPorVenda: '', embalagemInclusa: false },
    margemAlvoPct: '40',
    perfilId: undefined,
    dataReferencia: hojeISO(),
    logistica: 'drop_off',
    caixas: [{ quantidade: 1, pesoKg: '', comprimentoCm: '', larguraCm: '', alturaCm: '' }],
    frete: { modo: 'tabela' },
    tarifas: { base: 'anunciado', ajustes: {} },
    promocao: { ativo: false, tipoDesconto: 'valor', desconto: '', reembolsoML: { estado: 'nao_informado', tipo: 'valor', valor: '' } },
    ads: { ativo: false, tipo: 'percentual', valor: '', base: 'anunciado' },
    devolucoes: { ativo: false, eventos: [] },
    despesasFixas: { ativo: false, itens: [] },
    tributacao: { modo: 'regime_empresa' },
  };
}

const aj = (a?: AjusteTarifa): AjusteTarifa | undefined => (a ? { ...a, valor: deBR(a.valor) } : undefined);

/** Converte os números digitados para o formato do motor (ponto decimal). */
export function paraEntrada(f: FormSim): EntradaSimulacao {
  return {
    ...f,
    custos: {
      ...f.custos,
      compraUnitaria: deBR(f.custos.compraUnitaria),
      freteEntradaUnitario: deBR(f.custos.freteEntradaUnitario),
      embalagemPorVenda: deBR(f.custos.embalagemPorVenda),
    },
    margemAlvoPct: deBR(f.margemAlvoPct),
    caixas: f.caixas.map((c) => ({ ...c, pesoKg: deBR(c.pesoKg), comprimentoCm: deBR(c.comprimentoCm), larguraCm: deBR(c.larguraCm), alturaCm: deBR(c.alturaCm) })),
    frete: { ...f.frete, manual: f.frete.manual ? { ...f.frete.manual, valor: deBR(f.frete.manual.valor) } : undefined },
    tarifas: { base: f.tarifas.base, ajustes: { gold_special: aj(f.tarifas.ajustes.gold_special), gold_pro: aj(f.tarifas.ajustes.gold_pro) } },
    promocao: { ...f.promocao, desconto: deBR(f.promocao.desconto), reembolsoML: { ...f.promocao.reembolsoML, valor: deBR(f.promocao.reembolsoML.valor) } },
    ads: { ...f.ads, valor: deBR(f.ads.valor) },
    devolucoes: { ...f.devolucoes, eventos: f.devolucoes.eventos.map((e) => ({ ...e, valor: deBR(e.valor), probabilidadePct: deBR(e.probabilidadePct), prejuizoMedio: deBR(e.prejuizoMedio) })) },
    despesasFixas: { ...f.despesasFixas, itens: f.despesasFixas.itens.map((i) => ({ ...i, valor: deBR(i.valor), volumeMensal: deBR(i.volumeMensal) })) },
  };
}

const CHAVE = 'precificacao-ml:rascunho:v1';
export function lerRascunho(): FormSim | null {
  try {
    const s = localStorage.getItem(CHAVE);
    return s ? { ...formInicial(), ...JSON.parse(s) } : null;
  } catch {
    return null;
  }
}
export function gravarRascunho(f: FormSim) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(f));
  } catch {
    /* armazenamento indisponível */
  }
}
