import { Decimal, d, money, isNumeric, ZERO } from './decimal';
import { calcularTarifa } from './fees';
import { calcularFrete, prevalidarFrete, type ContextoFrete } from './shipping';
import { calcularProvisao, calcularTributos, prevalidarTributos } from './taxes';
import type {
  Avaliacao, BasePreco, EntradaSimulacao, LinhaMemoria, PerfilCnpj, Regime, RegraTarifa, TabelaFrete,
} from './types';
import { LOGISTICAS, NOME_BASE, NOME_TIPO_ANUNCIO } from './types';

export interface Contexto {
  entrada: EntradaSimulacao;
  regraTarifa: RegraTarifa;
  tabela?: TabelaFrete;
  perfil?: PerfilCnpj;
  regime: Regime;
  modoDemo: boolean;
}

const R = (v: Decimal) => `R$ ${v.toFixed(2).replace('.', ',')}`;

export function contextoFrete(ctx: Contexto): ContextoFrete {
  const e = ctx.entrada;
  return { frete: e.frete, tabela: ctx.tabela, caixas: e.caixas, logistica: e.logistica, dataReferencia: e.dataReferencia, modoDemo: ctx.modoDemo };
}

// ------------------------------------------------------------------ Receita

export interface Receita {
  anunciado: Decimal;
  descontoTotal: Decimal;
  reembolsoML: Decimal;
  descontoLoja: Decimal;
  pagoComprador: Decimal;
  receitaVendedor: Decimal;
}

export function calcularReceita(e: EntradaSimulacao, preco: Decimal): Receita {
  const p = e.promocao;
  let desconto = ZERO;
  let reembolso = ZERO;
  if (p.ativo) {
    desconto = p.tipoDesconto === 'percentual' ? money(preco.mul(d(p.desconto)).div(100)) : money(d(p.desconto));
    if (desconto.gt(preco)) desconto = preco;
    if (p.reembolsoML.estado === 'informado') {
      reembolso = p.reembolsoML.tipo === 'percentual_desconto' ? money(desconto.mul(d(p.reembolsoML.valor)).div(100)) : money(d(p.reembolsoML.valor));
      if (reembolso.gt(desconto)) reembolso = desconto;
    }
  }
  const descontoLoja = desconto.minus(reembolso);
  return {
    anunciado: preco,
    descontoTotal: desconto,
    reembolsoML: reembolso,
    descontoLoja,
    pagoComprador: preco.minus(desconto),
    receitaVendedor: preco.minus(descontoLoja),
  };
}

export function bases(r: Receita): Record<BasePreco, Decimal> {
  return { anunciado: r.anunciado, pago_comprador: r.pagoComprador, receita_vendedor: r.receitaVendedor };
}

// ------------------------------------------------------------------ Pré-validação

export interface Prevalidacao {
  pendencias: string[];
  motivos: string[];
  avisos: string[];
}

function num(v: string | undefined, nome: string, pend: string[], { min = 0, maxExcl }: { min?: number; maxExcl?: number } = {}) {
  if (!isNumeric(v)) {
    pend.push(`${nome}: não informado`);
    return;
  }
  const x = d(v);
  if (x.lt(min) || (maxExcl !== undefined && x.gte(maxExcl))) pend.push(`${nome}: valor fora do intervalo permitido`);
}

/** Dados essenciais ausentes ou condições impeditivas que não dependem do preço. */
export function prevalidar(ctx: Contexto): Prevalidacao {
  const e = ctx.entrada;
  const pend: string[] = [];
  const motivos: string[] = [];
  const avisos: string[] = [];
  if (!Number.isInteger(e.unidadesPorVenda) || e.unidadesPorVenda < 1) pend.push('Quantidade de unidades por venda');
  num(e.custos.compraUnitaria, 'Custo unitário de compra', pend);
  if (!e.custos.freteEntradaIncluso) num(e.custos.freteEntradaUnitario, 'Frete de entrada (informe 0 se não houver)', pend);
  if (!e.custos.embalagemInclusa) num(e.custos.embalagemPorVenda, 'Embalagem (informe 0 se não houver)', pend);
  num(e.margemAlvoPct, 'Margem desejada', pend, { maxExcl: 100 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.dataReferencia ?? '')) pend.push('Data de referência');
  if (!e.categoria?.id && !ctx.regraTarifa.ajuste && !ctx.regraTarifa.faixas) pend.push('Categoria do Mercado Livre');

  if (e.promocao.ativo) {
    num(e.promocao.desconto, 'Promoção: desconto', pend);
    if (e.promocao.tipoDesconto === 'percentual' && isNumeric(e.promocao.desconto) && d(e.promocao.desconto).gt(100)) pend.push('Promoção: desconto acima de 100%');
    if (e.promocao.reembolsoML.estado === 'informado') num(e.promocao.reembolsoML.valor, 'Promoção: reembolso do Mercado Livre', pend);
    else avisos.push('Promoção: reembolso do Mercado Livre não informado — todo o desconto foi tratado como custeado pela loja');
  }
  if (e.ads.ativo) num(e.ads.valor, 'Mercado Ads', pend);
  if (e.devolucoes.ativo) {
    if (!e.devolucoes.eventos.length) pend.push('Devoluções: inclua ao menos um evento ou desative a reserva');
    e.devolucoes.eventos.forEach((ev, i) => {
      const n = `Devoluções: ${ev.nome || `evento ${i + 1}`}`;
      if (ev.modo === 'valor') num(ev.valor, `${n} (valor por venda)`, pend);
      else {
        num(ev.probabilidadePct, `${n} (probabilidade %)`, pend);
        num(ev.prejuizoMedio, `${n} (prejuízo médio líquido)`, pend);
      }
    });
    const nomes = e.devolucoes.eventos.map((ev) => ev.nome.trim().toLowerCase()).filter(Boolean);
    if (new Set(nomes).size !== nomes.length) avisos.push('Devoluções: há eventos com o mesmo nome — confira se não há sobreposição');
  }
  if (e.despesasFixas.ativo) {
    e.despesasFixas.itens.forEach((f, i) => {
      const n = `Despesa fixa: ${f.nome || `item ${i + 1}`}`;
      num(f.valor, n, pend);
      if (f.modo === 'mensal') {
        num(f.volumeMensal, `${n} (volume mensal estimado)`, pend);
        if (isNumeric(f.volumeMensal) && d(f.volumeMensal).lte(0)) pend.push(`${n}: volume mensal deve ser maior que zero`);
      }
    });
  }
  const fr = prevalidarFrete(contextoFrete(ctx));
  pend.push(...fr.pendencias);
  motivos.push(...fr.motivos);
  const tr = prevalidarTributos(ctx.perfil, ctx.regime, e.dataReferencia, ctx.modoDemo);
  pend.push(...tr.pendencias);
  motivos.push(...tr.motivos);
  avisos.push(...tr.avisos);
  if (!ctx.regraTarifa.faixas && !ctx.regraTarifa.cotacao && ctx.regraTarifa.ajuste?.escopo !== 'total') {
    pend.push(`Tarifa ${NOME_TIPO_ANUNCIO[ctx.regraTarifa.tipoAnuncio]}: consulta indisponível — informe a tarifa total manualmente`);
  }
  return { pendencias: [...new Set(pend)], motivos: [...new Set(motivos)], avisos: [...new Set(avisos)] };
}

// ------------------------------------------------------------------ Avaliação

export function custoAquisicao(e: EntradaSimulacao) {
  const n = new Decimal(e.unidadesPorVenda);
  const compra = money(d(e.custos.compraUnitaria).mul(n));
  const freteEntrada = e.custos.freteEntradaIncluso ? ZERO : money(d(e.custos.freteEntradaUnitario).mul(n));
  const embalagem = e.custos.embalagemInclusa ? ZERO : money(d(e.custos.embalagemPorVenda));
  return { compra, freteEntrada, embalagem, total: compra.plus(freteEntrada).plus(embalagem) };
}

export type ResultadoAvaliacao = { ok: true; av: Avaliacao; g: Decimal; margem: Decimal; resultado: Decimal } | { ok: false; motivos: string[] };

/**
 * Avalia um preço anunciado. g = resultado − margem alvo × receita (≥ 0 atinge a meta).
 * Se a provisão está pendente, a meta é medida sobre o resultado antes da provisão.
 */
export function avaliar(ctx: Contexto, preco: Decimal): ResultadoAvaliacao {
  const e = ctx.entrada;
  const memoria: LinhaMemoria[] = [];
  const avisos: string[] = [];
  const add = (l: Omit<LinhaMemoria, 'valor'> & { valor: Decimal }) => memoria.push({ ...l, valor: l.valor.toFixed(2) });

  // a) receita
  const rec = calcularReceita(e, preco);
  const b = bases(rec);
  add({ chave: 'preco', rotulo: 'Preço anunciado', valor: preco, tipo: 'subtotal' });
  if (e.promocao.ativo) {
    add({ chave: 'cupom', rotulo: 'Desconto/cupom total concedido ao comprador', valor: rec.descontoTotal.neg(), tipo: 'informativo', detalhe: e.promocao.tipoDesconto === 'percentual' ? `${e.promocao.desconto.replace('.', ',')}% do preço anunciado` : 'valor fixo' });
    add({ chave: 'pago', rotulo: 'Valor pago pelo comprador', valor: rec.pagoComprador, tipo: 'informativo' });
    add({ chave: 'desc_loja', rotulo: '(−) Desconto custeado pela loja', valor: rec.descontoLoja.neg(), tipo: 'deducao' });
    add({ chave: 'desc_ml', rotulo: 'Parcela do desconto custeada pelo Mercado Livre (não reduz sua receita)', valor: rec.reembolsoML, tipo: 'informativo', detalhe: e.promocao.reembolsoML.estado === 'informado' ? 'reembolso informado' : 'reembolso não informado — considerado zero' });
  }
  add({ chave: 'receita', rotulo: '= Receita do vendedor (base da margem)', valor: rec.receitaVendedor, tipo: 'subtotal' });

  // b) tarifa
  const baseTarifa = b[e.tarifas.base];
  const tr = calcularTarifa(ctx.regraTarifa, baseTarifa);
  if (!tr.ok) return { ok: false, motivos: [tr.pendencia] };
  const t = tr.tarifa;
  const nomeTA = NOME_TIPO_ANUNCIO[ctx.regraTarifa.tipoAnuncio];
  add({
    chave: 'tarifa',
    rotulo: `(−) Tarifa de venda ${nomeTA}`,
    valor: t.total.neg(),
    tipo: 'deducao',
    manual: !!t.ajusteDescricao,
    fonte: t.fonte,
    detalhe:
      `Base: ${NOME_BASE[e.tarifas.base]} ${R(baseTarifa)}. ` +
      (t.percentualAplicado ? `Parcela percentual ${t.percentualAplicado.toDecimalPlaces(4).toString().replace('.', ',')}% = ${R(t.variavel)}; ` : `Parcela variável ${R(t.variavel)}; `) +
      `tarifa fixa ${R(t.fixa)} (já incluída no total, contada uma vez).` +
      (t.consultado && t.ajusteDescricao ? ` Valor consultado: ${R(t.consultado.total)}; ajuste aplicado: ${t.ajusteDescricao}.` : '') +
      (t.consultado && !t.consultado.exato && !t.ajusteDescricao ? ' Estimado a partir da regra consultada em outro preço.' : ''),
  });

  // frete do vendedor
  const fctx = contextoFrete(ctx);
  const baseFrete = ctx.tabela && e.frete.modo === 'tabela' ? b[ctx.tabela.baseFaixaPreco] : preco;
  const fr = calcularFrete(fctx, baseFrete);
  if (!fr.ok) return { ok: false, motivos: [...fr.motivos, ...fr.pendencias] };
  add({ chave: 'frete', rotulo: '(−) Frete pago pelo vendedor', valor: fr.total.neg(), tipo: 'deducao', fonte: fr.detalhe.fonte, manual: fr.detalhe.origem === 'manual', detalhe: fr.detalhe.regra });
  const me2 = LOGISTICAS[e.logistica].shippingMode === 'me2';
  const repasse = rec.receitaVendedor.minus(t.total).minus(me2 ? fr.total : ZERO);
  add({
    chave: 'repasse',
    rotulo: '= Repasse estimado do Mercado Livre',
    valor: repasse,
    tipo: 'subtotal',
    detalhe: me2 ? 'Receita − tarifa − frete (Mercado Envios desconta o frete do repasse)' : 'Receita − tarifa (frete pago diretamente à transportadora, fora do repasse)',
  });

  // c) custos internos
  const ca = custoAquisicao(e);
  add({ chave: 'compra', rotulo: `(−) Compra para revenda (${e.unidadesPorVenda} un.)`, valor: ca.compra.neg(), tipo: 'deducao' });
  if (!e.custos.freteEntradaIncluso) add({ chave: 'frete_entrada', rotulo: '(−) Frete de entrada', valor: ca.freteEntrada.neg(), tipo: 'deducao' });
  if (!e.custos.embalagemInclusa) add({ chave: 'embalagem', rotulo: '(−) Embalagem', valor: ca.embalagem.neg(), tipo: 'deducao' });
  if (e.custos.freteEntradaIncluso || e.custos.embalagemInclusa) {
    add({ chave: 'inclusos', rotulo: `${[e.custos.freteEntradaIncluso && 'Frete de entrada', e.custos.embalagemInclusa && 'embalagem'].filter(Boolean).join(' e ')} já incluído(s) no custo de compra`, valor: ZERO, tipo: 'informativo' });
  }

  // tributos
  const trib = calcularTributos(ctx.perfil!, ctx.regime, b, ca.compra);
  for (const l of trib.linhas) {
    add({ chave: l.chave, rotulo: l.valor.lt(0) ? `(+) ${l.rotulo}` : `(−) ${l.rotulo}`, valor: l.valor.neg(), detalhe: l.detalhe, tipo: l.informativo ? 'informativo' : l.valor.lt(0) ? 'acrescimo' : 'deducao' });
  }

  // despesas
  let ads = ZERO;
  if (e.ads.ativo) {
    ads = e.ads.tipo === 'valor' ? money(d(e.ads.valor)) : money(b[e.ads.base].mul(d(e.ads.valor)).div(100));
    add({ chave: 'ads', rotulo: '(−) Mercado Ads', valor: ads.neg(), tipo: 'deducao', detalhe: e.ads.tipo === 'valor' ? 'valor por venda' : `${e.ads.valor.replace('.', ',')}% × ${NOME_BASE[e.ads.base]} ${R(b[e.ads.base])}` });
  }
  let dev = ZERO;
  if (e.devolucoes.ativo) {
    for (const [i, ev] of e.devolucoes.eventos.entries()) {
      const v = ev.modo === 'valor' ? money(d(ev.valor)) : money(d(ev.probabilidadePct).div(100).mul(d(ev.prejuizoMedio)));
      dev = dev.plus(v);
      add({ chave: `dev_${i}`, rotulo: `(−) Reserva: ${ev.nome || 'devoluções'}`, valor: v.neg(), tipo: 'deducao', detalhe: ev.modo === 'valor' ? 'valor médio por venda' : `${ev.probabilidadePct!.replace('.', ',')}% × prejuízo líquido ${R(d(ev.prejuizoMedio))}` });
    }
  }
  let fixas = ZERO;
  if (e.despesasFixas.ativo) {
    for (const [i, f] of e.despesasFixas.itens.entries()) {
      const v = f.modo === 'por_venda' ? money(d(f.valor)) : f.modo === 'percentual_receita' ? money(rec.receitaVendedor.mul(d(f.valor)).div(100)) : money(d(f.valor).div(d(f.volumeMensal)));
      fixas = fixas.plus(v);
      add({
        chave: `fixa_${i}`,
        rotulo: `(−) Despesa fixa alocada: ${f.nome || `item ${i + 1}`}`,
        valor: v.neg(),
        tipo: 'deducao',
        detalhe: f.modo === 'por_venda' ? 'valor por venda' : f.modo === 'percentual_receita' ? `${f.valor.replace('.', ',')}% da receita` : `${R(d(f.valor))}/mês ÷ ${f.volumeMensal} vendas/mês`,
      });
    }
  }

  const antes = rec.receitaVendedor.minus(ca.total).minus(t.total).minus(fr.total).minus(trib.total).minus(ads).minus(dev).minus(fixas);
  add({ chave: 'antes_prov', rotulo: '= Resultado antes da provisão de IRPJ/CSLL', valor: antes, tipo: 'subtotal' });
  const prov = calcularProvisao(trib.provisao, antes, rec.receitaVendedor);
  let resultado = antes;
  if (prov.valor === null) {
    avisos.push('Provisão de IRPJ/CSLL sem critério do contador: resultado e margem apresentados ANTES da provisão — margem final pendente');
    add({ chave: 'provisao', rotulo: 'Provisão IRPJ/CSLL', valor: ZERO, tipo: 'informativo', detalhe: prov.detalhe });
  } else if (trib.provisao) {
    resultado = antes.minus(prov.valor);
    add({ chave: 'provisao', rotulo: '(−) Provisão gerencial IRPJ/CSLL', valor: prov.valor.neg(), tipo: 'deducao', detalhe: prov.detalhe });
  }
  add({ chave: 'resultado', rotulo: prov.valor === null ? '= Resultado antes da provisão (margem final pendente)' : '= Resultado gerencial da venda', valor: resultado, tipo: 'resultado' });

  const margem = rec.receitaVendedor.gt(0) ? resultado.div(rec.receitaVendedor) : new Decimal(-Infinity);
  const alvo = d(e.margemAlvoPct).div(100);
  const g = rec.receitaVendedor.gt(0) ? resultado.minus(alvo.mul(rec.receitaVendedor)) : new Decimal(-1);

  return {
    ok: true,
    g,
    margem,
    resultado,
    av: {
      preco: preco.toFixed(2),
      precoPagoComprador: rec.pagoComprador.toFixed(2),
      receitaVendedor: rec.receitaVendedor.toFixed(2),
      baseTarifa: baseTarifa.toFixed(2),
      tarifa: t.total.toFixed(2),
      frete: fr.total.toFixed(2),
      repasseML: repasse.toFixed(2),
      custoAquisicao: ca.total.toFixed(2),
      tributosLiquidos: trib.total.toFixed(2),
      ads: ads.toFixed(2),
      devolucoes: dev.toFixed(2),
      despesasFixas: fixas.toFixed(2),
      resultadoAntesProvisao: antes.toFixed(2),
      provisao: prov.valor === null ? null : prov.valor.toFixed(2),
      resultado: resultado.toFixed(2),
      margemPct: margem.isFinite() ? margem.mul(100).toDecimalPlaces(2).toFixed(2) : '-',
      memoria,
      frete_detalhe: fr.detalhe,
      avisos,
    },
  };
}
