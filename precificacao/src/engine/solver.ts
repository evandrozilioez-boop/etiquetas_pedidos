import { Decimal, fromCents, toCents } from './decimal';
import { avaliar, bases, calcularReceita, prevalidar, type Contexto, type ResultadoAvaliacao } from './evaluate';
import { limitesFaixasTarifa, tarifaConhecidaEmTodoPreco } from './fees';
import { limitesPrecoTabela } from './shipping';
import type { Avaliacao, BasePreco } from './types';

/** Preço máximo pesquisado: R$ 10.000.000,00. */
export const TETO_CENTAVOS = 1_000_000_000;
const R = (c: number) => `R$ ${fromCents(c).toNumber().toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface Solucao {
  status: 'encontrado' | 'inviavel' | 'pendente';
  precoCentavos?: number;
  avaliacao?: Avaliacao;
  /** true quando todas as regras dependentes de preço são conhecidas e todos os intervalos foram verificados */
  minimoComprovado: boolean;
  pendencias: string[];
  motivos: string[];
  avisos: string[];
  diagnostico: string[];
  avaliacoes: number;
}

/** Menor preço anunciado (centavos) cuja base atinge `alvo`; as bases são não decrescentes no preço. */
export function precoParaBase(ctx: Contexto, base: BasePreco, alvo: Decimal): number | null {
  const val = (c: number) => bases(calcularReceita(ctx.entrada, fromCents(c)))[base];
  if (val(TETO_CENTAVOS).lt(alvo)) return null;
  let lo = 1, hi = TETO_CENTAVOS;
  if (val(lo).gte(alvo)) return lo;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (val(mid).gte(alvo)) hi = mid; else lo = mid;
  }
  return hi;
}

/**
 * Pontos onde alguma regra muda de faixa, convertidos para preço anunciado.
 * Entre dois pontos consecutivos todas as regras são afins no preço, logo
 * g(P) = resultado − meta × receita é monótona e uma bissecção local é válida.
 */
export function limitesEmPrecoAnunciado(ctx: Contexto): number[] {
  const pts = new Set<number>([1]);
  const e = ctx.entrada;
  if (ctx.tabela && e.frete.modo === 'tabela') {
    for (const v of limitesPrecoTabela(ctx.tabela)) {
      const c = precoParaBase(ctx, ctx.tabela.baseFaixaPreco, v);
      if (c) pts.add(c);
    }
  }
  for (const v of limitesFaixasTarifa(ctx.regraTarifa)) {
    const c = precoParaBase(ctx, e.tarifas.base, v);
    if (c) pts.add(c);
  }
  return [...pts].sort((a, b) => a - b);
}

export function resolver(ctx: Contexto): Solucao {
  const pre = prevalidar(ctx);
  const base: Solucao = { status: 'pendente', minimoComprovado: false, pendencias: pre.pendencias, motivos: pre.motivos, avisos: pre.avisos, diagnostico: [], avaliacoes: 0 };
  if (pre.pendencias.length) return base;
  if (pre.motivos.length) return { ...base, status: 'inviavel' };

  const cache = new Map<number, ResultadoAvaliacao>();
  const ev = (c: number) => {
    let r = cache.get(c);
    if (!r) {
      r = avaliar(ctx, fromCents(c));
      cache.set(c, r);
    }
    return r;
  };
  const passa = (c: number) => {
    const r = ev(c);
    return r.ok && r.g.gte(0);
  };

  const inicios = limitesEmPrecoAnunciado(ctx);
  const errosFaixa = new Set<string>();
  const diag: string[] = [];
  let achado: number | null = null;

  for (let i = 0; i < inicios.length && achado === null; i++) {
    const lo = inicios[i];
    const hi = i + 1 < inicios.length ? inicios[i + 1] - 1 : TETO_CENTAVOS;
    const rlo = ev(lo), rhi = ev(hi);
    if (!rlo.ok || !rhi.ok) {
      for (const m of [...(rlo.ok ? [] : rlo.motivos), ...(rhi.ok ? [] : rhi.motivos)]) errosFaixa.add(m);
      if (inicios.length > 1) diag.push(`${R(lo)} a ${R(hi)}: regra indisponível (${[...(rlo.ok ? [] : rlo.motivos), ...(rhi.ok ? [] : rhi.motivos)][0]})`);
      continue;
    }
    if (rlo.g.gte(0)) {
      achado = lo;
    } else if (rhi.g.lt(0)) {
      if (inicios.length > 1) diag.push(`${R(lo)} a ${R(hi)}: meta não atingida (melhor margem no intervalo: ${Decimal.max(rlo.margem, rhi.margem).mul(100).toDecimalPlaces(2).toString().replace('.', ',')}%)`);
      continue;
    } else {
      let a = lo, b = hi; // passa(a) = false, passa(b) = true
      while (b - a > 1) {
        const m = Math.floor((a + b) / 2);
        if (passa(m)) b = m; else a = m;
      }
      // proteção contra oscilações de arredondamento em centavos
      for (let c = b - 1; c >= Math.max(lo, b - 25); c--) if (passa(c)) b = c;
      achado = b;
    }
    if (achado !== null && inicios.length > 1) {
      diag.push(`${R(lo)} a ${R(hi)}: primeira faixa que comporta a meta — menor preço ${R(achado)}`);
      if (achado === lo && lo > 1) {
        const antes = ev(lo - 1);
        diag.push(`Fronteira: em ${R(lo - 1)} ${antes.ok ? `a margem é ${antes.margem.mul(100).toDecimalPlaces(2).toString().replace('.', ',')}%` : 'a regra não se aplica'}; em ${R(lo)} a meta é atingida`);
      }
    }
  }

  const provavel = tarifaConhecidaEmTodoPreco(ctx.regraTarifa);
  if (achado !== null) {
    const r = ev(achado) as Extract<ResultadoAvaliacao, { ok: true }>;
    return {
      ...base,
      status: 'encontrado',
      precoCentavos: achado,
      avaliacao: r.av,
      avisos: [...base.avisos, ...r.av.avisos],
      minimoComprovado: provavel,
      diagnostico: diag,
      avaliacoes: cache.size,
    };
  }

  // inviável: explicar
  const motivos: string[] = [];
  if (errosFaixa.size) motivos.push(...errosFaixa);
  const top = ev(TETO_CENTAVOS), top2 = ev(TETO_CENTAVOS - 100_000_00);
  if (top.ok && top2.ok) {
    const dP = fromCents(TETO_CENTAVOS).minus(fromCents(TETO_CENTAVOS - 100_000_00));
    const dRes = top.resultado.minus(top2.resultado).div(dP);
    const recTop = calcularReceita(ctx.entrada, fromCents(TETO_CENTAVOS)).receitaVendedor;
    const recTop2 = calcularReceita(ctx.entrada, fromCents(TETO_CENTAVOS - 100_000_00)).receitaVendedor;
    const dRec = recTop.minus(recTop2).div(dP);
    const exigido = dRec.mul(ctx.entrada.margemAlvoPct).div(100);
    motivos.push(
      `Meta inviável: cada R$ 1,00 a mais no preço gera R$ ${dRes.toDecimalPlaces(4).toString().replace('.', ',')} de resultado, ` +
        `mas a margem de ${ctx.entrada.margemAlvoPct.replace('.', ',')}% exige R$ ${exigido.toDecimalPlaces(4).toString().replace('.', ',')}. ` +
        'Tarifas, tributos e despesas percentuais somados à margem desejada consomem 100% ou mais da receita. Reduza a margem ou os percentuais.',
    );
  } else if (!motivos.length) {
    motivos.push('Nenhum preço até R$ 10.000.000,00 atinge a meta com as regras disponíveis');
  }
  return { ...base, status: 'inviavel', motivos, diagnostico: diag, avaliacoes: cache.size, minimoComprovado: false };
}

export { toCents };
