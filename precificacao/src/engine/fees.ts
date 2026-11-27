import { Decimal, d, money, pct, isNumeric, ZERO } from './decimal';
import type { AjusteTarifa, CotacaoTarifa, FaixaTarifa, RegraTarifa } from './types';

/**
 * Regra de leitura da API listing_prices (documentação oficial, "Custos por vender"):
 *  - sale_fee_amount é o custo TOTAL de vender;
 *  - sale_fee_details.fixed_fee "já está incluído em sale_fee_amount; não o adicione novamente";
 *  - sale_fee_details.percentage_fee é a porcentagem de comissão total;
 *  - financing_add_on_fee (parcelamento) e gross_amount apenas detalham o total.
 * Portanto a tarifa é descontada uma única vez: total = parcela percentual + tarifa fixa.
 */
export interface TarifaCalculada {
  total: Decimal;
  variavel: Decimal;
  fixa: Decimal;
  percentualAplicado: Decimal | null;
  consultado: { total: Decimal; variavel: Decimal; fixa: Decimal; exato: boolean } | null;
  ajusteDescricao?: string;
  fonte: string;
}

export type ResultadoTarifa = { ok: true; tarifa: TarifaCalculada } | { ok: false; pendencia: string };

function faixaPara(faixas: FaixaTarifa[], base: Decimal): FaixaTarifa | undefined {
  return faixas.find((f) => base.gte(d(f.precoMin)) && (!f.precoMax || base.lt(d(f.precoMax))));
}

/** Percentual efetivo da cotação: usa percentage_fee se reproduz o total; senão deriva do total. */
export function percentualEfetivo(c: CotacaoTarifa): Decimal {
  const preco = d(c.precoConsultado);
  const total = d(c.total);
  const fixa = d(c.fixa);
  const informado = d(c.percentual);
  if (money(preco.mul(informado).div(100)).plus(fixa).eq(total)) return informado;
  if (preco.isZero()) return informado;
  return total.minus(fixa).div(preco).mul(100);
}

export function calcularTarifa(regra: RegraTarifa, base: Decimal): ResultadoTarifa {
  let consultado: TarifaCalculada['consultado'] = null;
  let pctBase: Decimal | null = null;
  if (regra.faixas?.length) {
    const f = faixaPara(regra.faixas, base);
    if (!f) return { ok: false, pendencia: `Tarifa: sem faixa de tarifa para base R$ ${base.toFixed(2)}` };
    pctBase = d(f.percentual);
    const variavel = money(base.mul(pctBase).div(100));
    consultado = { total: variavel.plus(d(f.fixa)), variavel, fixa: d(f.fixa), exato: true };
  } else if (regra.cotacao) {
    const c = regra.cotacao;
    if (base.eq(d(c.precoConsultado))) {
      const total = d(c.total);
      consultado = { total, variavel: total.minus(d(c.fixa)), fixa: d(c.fixa), exato: true };
      pctBase = percentualEfetivo(c);
    } else {
      pctBase = percentualEfetivo(c);
      const variavel = money(base.mul(pctBase).div(100));
      consultado = { total: variavel.plus(d(c.fixa)), variavel, fixa: d(c.fixa), exato: false };
    }
  }

  const a = regra.ajuste;
  if (!a) {
    if (!consultado) return { ok: false, pendencia: 'Tarifa: consulta indisponível — informe a tarifa manualmente' };
    return { ok: true, tarifa: { ...consultado, percentualAplicado: pctBase, consultado, fonte: regra.fonte } };
  }
  if (!isNumeric(a.valor) || d(a.valor).lt(0)) return { ok: false, pendencia: 'Tarifa: valor do ajuste manual' };
  const v = d(a.valor);
  const desc = descreverAjuste(a);
  if (a.escopo === 'total') {
    const total = a.tipo === 'percentual' ? money(base.mul(pct(v))) : money(v);
    return {
      ok: true,
      tarifa: {
        total,
        variavel: a.tipo === 'percentual' ? total : ZERO,
        fixa: a.tipo === 'percentual' ? ZERO : total,
        percentualAplicado: a.tipo === 'percentual' ? v : null,
        consultado,
        ajusteDescricao: desc,
        fonte: `Ajuste manual (${desc})`,
      },
    };
  }
  if (!consultado) {
    return { ok: false, pendencia: `Tarifa: o ajuste "${desc}" substitui só um componente; sem consulta, informe a tarifa total` };
  }
  if (a.escopo === 'percentual') {
    const variavel = a.tipo === 'percentual' ? money(base.mul(pct(v))) : money(v);
    return {
      ok: true,
      tarifa: {
        total: variavel.plus(consultado.fixa),
        variavel,
        fixa: consultado.fixa,
        percentualAplicado: a.tipo === 'percentual' ? v : null,
        consultado,
        ajusteDescricao: desc,
        fonte: `${regra.fonte} + ajuste manual (${desc})`,
      },
    };
  }
  // escopo fixa
  if (a.tipo !== 'valor') return { ok: false, pendencia: 'Tarifa: ajuste da tarifa fixa deve ser em reais' };
  const fixa = money(v);
  return {
    ok: true,
    tarifa: {
      total: consultado.variavel.plus(fixa),
      variavel: consultado.variavel,
      fixa,
      percentualAplicado: pctBase,
      consultado,
      ajusteDescricao: desc,
      fonte: `${regra.fonte} + ajuste manual (${desc})`,
    },
  };
}

export function descreverAjuste(a: AjusteTarifa): string {
  const alvo = a.escopo === 'total' ? 'tarifa total' : a.escopo === 'percentual' ? 'componente percentual' : 'tarifa fixa';
  const val = a.tipo === 'percentual' ? `${a.valor.replace('.', ',')}%` : `R$ ${d(a.valor).toFixed(2).replace('.', ',')}`;
  return `${alvo} substituída por ${val}${a.motivo ? ` — ${a.motivo}` : ''}`;
}

/** A tarifa é conhecida para qualquer preço? (necessário para afirmar mínimo global) */
export function tarifaConhecidaEmTodoPreco(regra: RegraTarifa): boolean {
  if (regra.ajuste?.escopo === 'total') return true;
  return !!regra.faixas?.length;
}

export function limitesFaixasTarifa(regra: RegraTarifa): Decimal[] {
  if (regra.ajuste?.escopo === 'total' || !regra.faixas) return [];
  const out: Decimal[] = [];
  for (const f of regra.faixas) {
    if (d(f.precoMin).gt(0)) out.push(d(f.precoMin));
    if (f.precoMax) out.push(d(f.precoMax));
  }
  return out;
}
