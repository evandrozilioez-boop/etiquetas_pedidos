import { Dec, Decimal, d, money, ZERO, isNumeric } from './decimal';
import type { Caixa, DetalheCaixa, DetalheFrete, FreteEntrada, LinhaFrete, Logistica, TabelaFrete } from './types';
import { LOGISTICAS } from './types';

export type ResultadoFrete =
  | { ok: true; detalhe: DetalheFrete; total: Decimal }
  | { ok: false; motivos: string[]; pendencias: string[] };

const kg = (v: Decimal) => v.toDecimalPlaces(3).toFixed(3).replace('.', ',');

function arredondaPeso(p: Decimal, regra: TabelaFrete['arredondamentoPeso']): Decimal {
  const passo = regra === 'cima_0.1' ? '0.1' : regra === 'cima_0.5' ? '0.5' : regra === 'cima_1' ? '1' : null;
  if (!passo) return p;
  return p.div(passo).toDecimalPlaces(0, Decimal.ROUND_CEIL).mul(passo);
}

export function validarCaixas(caixas: Caixa[]): string[] {
  const p: string[] = [];
  if (!caixas.length) p.push('Caixas: informe ao menos uma caixa por venda');
  caixas.forEach((c, i) => {
    const n = i + 1;
    if (!Number.isInteger(c.quantidade) || c.quantidade < 1) p.push(`Caixa ${n}: quantidade de caixas iguais`);
    for (const [campo, nome] of [
      ['pesoKg', 'peso real (kg)'],
      ['comprimentoCm', 'comprimento (cm)'],
      ['larguraCm', 'largura (cm)'],
      ['alturaCm', 'altura (cm)'],
    ] as const) {
      if (!isNumeric(c[campo]) || d(c[campo]).lte(0)) p.push(`Caixa ${n}: ${nome}`);
    }
  });
  return p;
}

function dentroVigencia(t: { vigenciaInicio: string; vigenciaFim?: string }, data: string): boolean {
  if (data < t.vigenciaInicio) return false;
  if (t.vigenciaFim && data > t.vigenciaFim) return false;
  return true;
}

function linhaCabe(l: LinhaFrete, preco: Decimal, peso: Decimal, regiao?: string): boolean {
  if (preco.lt(d(l.precoMin))) return false;
  if (l.precoMax && preco.gte(d(l.precoMax))) return false;
  const pmin = d(l.pesoMin);
  if (pmin.gt(0) ? peso.lte(pmin) : peso.lt(0)) return false;
  if (l.pesoMax && peso.gt(d(l.pesoMax))) return false;
  if (l.regiao && l.regiao !== (regiao ?? '')) return false;
  return true;
}

function procurarLinha(t: TabelaFrete, preco: Decimal, peso: Decimal, regiao?: string): LinhaFrete | undefined {
  const cand = t.linhas.filter((l) => linhaCabe(l, preco, peso, regiao));
  return cand.find((l) => l.regiao) ?? cand[0];
}

function descreveLinha(l: LinhaFrete): string {
  const f = (v?: string) => (v ? v.replace('.', ',') : '∞');
  return `preço [${f(l.precoMin)}; ${f(l.precoMax)}) · peso (${f(l.pesoMin)}; ${f(l.pesoMax)}] kg${l.regiao ? ` · região ${l.regiao}` : ''} → R$ ${d(l.custo).toFixed(2).replace('.', ',')}`;
}

/** Pontos de preço (na base da tabela) onde o custo de frete pode mudar. */
export function limitesPrecoTabela(t: TabelaFrete): Decimal[] {
  const s = new Set<string>();
  for (const l of t.linhas) {
    s.add(d(l.precoMin).toFixed(2));
    if (l.precoMax) s.add(d(l.precoMax).toFixed(2));
  }
  return [...s].map((v) => new Dec(v)).filter((v) => v.gt(0));
}

export interface ContextoFrete {
  frete: FreteEntrada;
  tabela?: TabelaFrete;
  caixas: Caixa[];
  logistica: Logistica;
  dataReferencia: string;
  modoDemo: boolean;
}

/** Verificações que não dependem do preço (executadas uma vez). */
export function prevalidarFrete(ctx: ContextoFrete): { motivos: string[]; pendencias: string[] } {
  const motivos: string[] = [];
  const pendencias: string[] = [];
  const { frete, tabela } = ctx;
  if (frete.modo === 'manual') {
    if (!frete.manual || !isNumeric(frete.manual.valor)) pendencias.push('Frete: valor da cotação manual');
    else if (d(frete.manual.valor).lt(0)) motivos.push('Frete: cotação manual negativa');
    if (!frete.manual?.origem?.trim()) pendencias.push('Frete: origem da cotação manual');
    return { motivos, pendencias };
  }
  pendencias.push(...validarCaixas(ctx.caixas));
  if (!frete.tabelaId) {
    pendencias.push('Frete: escolha uma tabela de frete ou informe cotação manual');
    return { motivos, pendencias };
  }
  if (!tabela) {
    motivos.push('Frete: tabela selecionada não encontrada');
    return { motivos, pendencias };
  }
  if (tabela.demo && !ctx.modoDemo) motivos.push(`Frete: a tabela "${tabela.nome}" é fictícia e só pode ser usada no modo de demonstração`);
  if (!dentroVigencia(tabela, ctx.dataReferencia)) {
    motivos.push(
      `Frete: tabela "${tabela.nome}" fora da vigência (${tabela.vigenciaInicio} a ${tabela.vigenciaFim ?? 'sem fim'}) para a data de referência ${ctx.dataReferencia}. Atualize a tabela ou informe uma cotação manual.`,
    );
  }
  if (!tabela.logisticas.includes(ctx.logistica)) {
    motivos.push(`Frete: a tabela "${tabela.nome}" não se aplica à modalidade ${LOGISTICAS[ctx.logistica].nome}`);
  }
  if (tabela.pesoCubico.aplicar && (!tabela.pesoCubico.divisor || !isNumeric(tabela.pesoCubico.divisor) || d(tabela.pesoCubico.divisor).lte(0))) {
    motivos.push('Frete: a tabela manda aplicar peso cúbico mas não define o divisor');
  }
  if (tabela.linhas.some((l) => l.regiao) && !ctx.frete.regiao) pendencias.push('Frete: região de destino (a tabela diferencia regiões)');
  return { motivos, pendencias };
}

export function calcularFrete(ctx: ContextoFrete, precoBase: Decimal): ResultadoFrete {
  const pre = prevalidarFrete(ctx);
  if (pre.motivos.length || pre.pendencias.length) return { ok: false, ...pre };
  const { frete } = ctx;

  if (frete.modo === 'manual') {
    const total = money(d(frete.manual!.valor));
    return {
      ok: true,
      total,
      detalhe: {
        origem: 'manual',
        regra: 'Cotação manual para a remessa completa',
        total: total.toFixed(2),
        fonte: `Cotação manual: ${frete.manual!.origem}`,
        caixas: ctx.caixas.map((c, i) => descreverCaixaSemTabela(c, i)),
      },
    };
  }

  const t = ctx.tabela!;
  const motivos: string[] = [];
  const divisor = t.pesoCubico.aplicar ? d(t.pesoCubico.divisor) : null;
  const caixas: (DetalheCaixa & { fat: Decimal })[] = ctx.caixas.map((c, i) => {
    const real = d(c.pesoKg);
    const L = d(c.comprimentoCm), W = d(c.larguraCm), H = d(c.alturaCm);
    const cub = divisor ? L.mul(W).mul(H).div(divisor) : null;
    const bruto = cub && cub.gt(real) ? cub : real;
    const fat = arredondaPeso(bruto, t.arredondamentoPeso);
    const lim = t.limites;
    const maior = Decimal.max(L, W, H);
    if (lim?.maiorLadoCm && maior.gt(d(lim.maiorLadoCm))) motivos.push(`Caixa ${i + 1}: maior lado ${maior} cm excede o limite de ${lim.maiorLadoCm} cm da tabela`);
    if (lim?.somaLadosCm && L.plus(W).plus(H).gt(d(lim.somaLadosCm))) motivos.push(`Caixa ${i + 1}: soma dos lados ${L.plus(W).plus(H)} cm excede ${lim.somaLadosCm} cm`);
    if (lim?.pesoMaxKg && fat.gt(d(lim.pesoMaxKg))) motivos.push(`Caixa ${i + 1}: peso faturável ${kg(fat)} kg excede ${lim.pesoMaxKg} kg`);
    return {
      indice: i + 1,
      quantidade: c.quantidade,
      pesoRealKg: real.toFixed(3),
      pesoCubicoKg: cub ? cub.toDecimalPlaces(3).toFixed(3) : undefined,
      pesoFaturavelKg: fat.toFixed(3),
      dimensoes: `${L} × ${W} × ${H} cm`,
      fat,
    };
  });
  const nVolumes = ctx.caixas.reduce((s, c) => s + c.quantidade, 0);
  if (t.limites?.maxVolumes && nVolumes > t.limites.maxVolumes) motivos.push(`A tabela aceita no máximo ${t.limites.maxVolumes} volume(s) por remessa; a venda tem ${nVolumes}`);
  if (nVolumes > 1 && t.regraVolumes === 'nao_aceita') {
    motivos.push(`A tabela "${t.nome}" não define regra para múltiplos volumes (${nVolumes} volumes nesta venda). Informe uma cotação manual para a remessa completa.`);
  }
  if (motivos.length) return { ok: false, motivos, pendencias: [] };

  const precoTxt = precoBase.toFixed(2).replace('.', ',');
  let total = ZERO;
  let regra: string;
  if (t.regraVolumes === 'conjunto' && nVolumes > 1) {
    const soma = caixas.reduce((s, c) => s.plus(c.fat.mul(c.quantidade)), ZERO);
    const l = procurarLinha(t, precoBase, soma, frete.regiao);
    if (!l) return { ok: false, motivos: [`Sem faixa na tabela para o conjunto de ${kg(soma)} kg com preço R$ ${precoTxt}`], pendencias: [] };
    total = money(d(l.custo));
    regra = `Cobrança pelo conjunto: soma dos pesos faturáveis = ${kg(soma)} kg → ${descreveLinha(l)}`;
    caixas.forEach((c) => (c.enquadramento = 'incluída no conjunto'));
  } else {
    for (const c of caixas) {
      const l = procurarLinha(t, precoBase, c.fat, frete.regiao);
      if (!l) return { ok: false, motivos: [`Caixa ${c.indice}: sem faixa na tabela para ${kg(c.fat)} kg com preço R$ ${precoTxt}`], pendencias: [] };
      c.enquadramento = descreveLinha(l);
      c.custoUnitario = d(l.custo).toFixed(2);
      total = total.plus(money(d(l.custo)).mul(c.quantidade));
    }
    regra = nVolumes > 1 ? `Cobrança por volume: cada uma das ${nVolumes} caixas enquadrada separadamente e somada` : 'Volume único';
  }
  return {
    ok: true,
    total,
    detalhe: {
      origem: 'tabela',
      regra: `${regra}. Faixa de preço avaliada sobre o ${t.baseFaixaPreco.replace('_', ' ')} (R$ ${precoTxt}).${t.pesoCubico.aplicar ? ` Peso cúbico = C×L×A ÷ ${t.pesoCubico.divisor}.` : ' Tabela sem peso cúbico.'}`,
      total: total.toFixed(2),
      fonte: `${t.nome} — ${t.fonte}`,
      vigencia: `${t.vigenciaInicio} a ${t.vigenciaFim ?? 'sem data final'}`,
      caixas: caixas.map(({ fat: _f, ...c }) => c),
      demo: t.demo,
    },
  };
}

function descreverCaixaSemTabela(c: Caixa, i: number): DetalheCaixa {
  return {
    indice: i + 1,
    quantidade: c.quantidade,
    pesoRealKg: isNumeric(c.pesoKg) ? d(c.pesoKg).toFixed(3) : '-',
    pesoFaturavelKg: '-',
    dimensoes: `${c.comprimentoCm || '?'} × ${c.larguraCm || '?'} × ${c.alturaCm || '?'} cm`,
    enquadramento: 'coberta pela cotação manual',
  };
}
