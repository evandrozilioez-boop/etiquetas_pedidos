import { describe, expect, it } from 'vitest';
import { avaliar, calcularReceita, d, resolver, simular, simularCenario, type Contexto, type RegraTarifa } from '../src/engine';
import { cot, entradaBase, perfilZero, provedorAPI, provedorFaixas, provedorIndisponivel, tabelaFrete } from './fixtures';

const tarifaZero: RegraTarifa = { tipoAnuncio: 'gold_special', ajuste: { escopo: 'total', tipo: 'percentual', valor: '0' }, fonte: 'teste' };
const ctx = (over: Partial<Contexto> = {}): Contexto => ({
  entrada: entradaBase(),
  regraTarifa: tarifaZero,
  perfil: perfilZero(),
  regime: 'simples',
  modoDemo: false,
  ...over,
});

describe('1. Compra R$ 600, demais custos zero, margem 40%', () => {
  it('preço R$ 1.000,00 e resultado R$ 400,00', () => {
    const s = resolver(ctx());
    expect(s.status).toBe('encontrado');
    expect(s.avaliacao!.preco).toBe('1000.00');
    expect(s.avaliacao!.resultado).toBe('400.00');
    expect(s.avaliacao!.margemPct).toBe('40.00');
    expect(s.minimoComprovado).toBe(true);
    // R$ 999,99 não atinge a meta
    const r = avaliar(ctx(), d('999.99'));
    expect(r.ok && r.g.lt(0)).toBe(true);
  });

  it('campo vazio não vira zero silencioso', () => {
    const e = entradaBase();
    e.custos.embalagemPorVenda = '';
    const s = resolver(ctx({ entrada: e }));
    expect(s.status).toBe('pendente');
    expect(s.pendencias.join()).toContain('Embalagem');
  });
});

describe('2. Tarifa fictícia de 15% e margem 25%', () => {
  const e = entradaBase({ margemAlvoPct: '25' });
  it('ajuste manual da tarifa total: preço R$ 1.000,00, tarifa R$ 150,00, resultado R$ 250,00', () => {
    const s = resolver(ctx({ entrada: e, regraTarifa: { tipoAnuncio: 'gold_special', ajuste: { escopo: 'total', tipo: 'percentual', valor: '15' }, fonte: 'teste' } }));
    expect(s.avaliacao!.preco).toBe('1000.00');
    expect(s.avaliacao!.tarifa).toBe('150.00');
    expect(s.avaliacao!.resultado).toBe('250.00');
  });
  it('mesma tarifa vinda de uma fonte com faixas: mínimo comprovado', async () => {
    const prov = provedorFaixas({ gold_special: [{ precoMin: '0', percentual: '15', fixa: '0' }], gold_pro: [{ precoMin: '0', percentual: '15', fixa: '0' }] });
    const r = await simularCenario(e, 'gold_special', 'simples', { perfil: perfilZero(), provedor: prov, modoDemo: true });
    expect(r.status).toBe('minimo_comprovado');
    expect(r.avaliacao!.preco).toBe('1000.00');
    expect(r.avaliacao!.tarifa).toBe('150.00');
    expect(r.avaliacao!.resultado).toBe('250.00');
  });
});

describe('3. Cupom de R$ 100: loja R$ 60, Mercado Livre R$ 40', () => {
  const e = entradaBase({
    promocao: { ativo: true, tipoDesconto: 'valor', desconto: '100', reembolsoML: { estado: 'informado', tipo: 'valor', valor: '40' } },
  });
  it('comprador paga R$ 900 e receita do vendedor é R$ 940', () => {
    const r = calcularReceita(e, d('1000'));
    expect(r.pagoComprador.toFixed(2)).toBe('900.00');
    expect(r.receitaVendedor.toFixed(2)).toBe('940.00');
    expect(r.descontoLoja.toFixed(2)).toBe('60.00');
  });
  it('cupom descontado uma única vez no resultado', () => {
    const r = avaliar(ctx({ entrada: e }), d('1000'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.av.receitaVendedor).toBe('940.00');
    expect(r.av.resultado).toBe('340.00'); // 940 − 600, sem segundo desconto
    const deducoesCupom = r.av.memoria.filter((l) => l.tipo === 'deducao' && /desconto/i.test(l.rotulo));
    expect(deducoesCupom).toHaveLength(1);
  });
  it('reembolso não informado não é presumido', () => {
    const e2 = entradaBase({ promocao: { ativo: true, tipoDesconto: 'valor', desconto: '100', reembolsoML: { estado: 'nao_informado', tipo: 'valor' } } });
    expect(calcularReceita(e2, d('1000')).receitaVendedor.toFixed(2)).toBe('900.00');
  });
});

describe('4. Sofá: uma unidade em duas caixas diferentes', () => {
  const caixas = [
    { quantidade: 1, pesoKg: '25', comprimentoCm: '200', larguraCm: '90', alturaCm: '50' },
    { quantidade: 1, pesoKg: '8', comprimentoCm: '90', larguraCm: '60', alturaCm: '40' },
  ];
  const e = entradaBase({ caixas, frete: { modo: 'tabela', tabelaId: 'tab-teste' }, margemAlvoPct: '25' });
  const regra15: RegraTarifa = { tipoAnuncio: 'gold_special', ajuste: { escopo: 'total', tipo: 'percentual', valor: '15' }, fonte: 'teste' };

  it('cobrança por volume: 70 + 40 = R$ 110; compra e tarifa contadas uma vez', () => {
    const r = avaliar(ctx({ entrada: e, tabela: tabelaFrete(), regraTarifa: regra15 }), d('1000'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.av.frete).toBe('110.00');
    expect(r.av.custoAquisicao).toBe('600.00');
    expect(r.av.tarifa).toBe('150.00');
    expect(r.av.frete_detalhe.caixas).toHaveLength(2);
    expect(r.av.frete_detalhe.caixas[0].pesoFaturavelKg).toBe('25.000');
    expect(r.av.resultado).toBe('140.00'); // 1000 − 150 − 110 − 600
  });
  it('cobrança pelo conjunto: 33 kg somados → faixa acima de 30 kg = R$ 120', () => {
    const r = avaliar(ctx({ entrada: e, tabela: tabelaFrete({ regraVolumes: 'conjunto' }), regraTarifa: regra15 }), d('1000'));
    expect(r.ok && r.av.frete).toBe('120.00');
    expect(r.ok && r.av.frete_detalhe.regra).toContain('33,000 kg');
  });
  it('peso cúbico só quando a tabela determina', () => {
    const t = tabelaFrete({ pesoCubico: { aplicar: true, divisor: '6000' } });
    const r = avaliar(ctx({ entrada: e, tabela: t, regraTarifa: regra15 }), d('1000'));
    // caixa 1: 200×90×50/6000 = 150 kg; caixa 2: 90×60×40/6000 = 36 kg
    expect(r.ok && r.av.frete_detalhe.caixas.map((c) => c.pesoFaturavelKg)).toEqual(['150.000', '36.000']);
    expect(r.ok && r.av.frete).toBe('240.00');
  });
  it('tabela sem regra de múltiplos volumes: motivo identificado; cotação manual resolve', () => {
    const s = resolver(ctx({ entrada: e, tabela: tabelaFrete({ regraVolumes: 'nao_aceita' }), regraTarifa: regra15 }));
    expect(s.status).toBe('inviavel');
    expect(s.motivos.join()).toContain('múltiplos volumes');
    const e2 = entradaBase({ caixas, frete: { modo: 'manual', manual: { valor: '180', origem: 'Cotação transportadora X, 27/11/2026' } }, margemAlvoPct: '25' });
    const s2 = resolver(ctx({ entrada: e2, regraTarifa: regra15 }));
    expect(s2.avaliacao!.frete).toBe('180.00');
    expect(s2.avaliacao!.frete_detalhe.fonte).toContain('Cotação manual');
  });
  it('excesso de dimensão identificado', () => {
    const s = resolver(ctx({ entrada: e, tabela: tabelaFrete({ limites: { maiorLadoCm: '150' } }), regraTarifa: regra15 }));
    expect(s.status).toBe('inviavel');
    expect(s.motivos.join()).toContain('maior lado 200 cm');
  });
});

describe('5. Faixa de frete com salto de custo', () => {
  // frete 0 abaixo de R$ 79,00 e R$ 30,00 a partir de R$ 79,00
  const tab = tabelaFrete({
    linhas: [
      { precoMin: '0', precoMax: '79', pesoMin: '0', custo: '0' },
      { precoMin: '79', pesoMin: '0', custo: '30' },
    ],
  });
  const base = (compra: string, margem: string) =>
    entradaBase({ custos: { ...entradaBase().custos, compraUnitaria: compra }, margemAlvoPct: margem, frete: { modo: 'tabela', tabelaId: 'tab-teste' } });

  it('margem cai logo após o limite', () => {
    const c = ctx({ entrada: base('50', '25'), tabela: tab });
    const antes = avaliar(c, d('78.99'));
    const depois = avaliar(c, d('79.00'));
    expect(antes.ok && depois.ok).toBe(true);
    if (!antes.ok || !depois.ok) return;
    expect(antes.av.frete).toBe('0.00');
    expect(depois.av.frete).toBe('30.00');
    expect(depois.margem.lt(antes.margem)).toBe(true);
  });
  it('meta cabe na primeira faixa: R$ 66,67', () => {
    const s = resolver(ctx({ entrada: base('50', '25'), tabela: tab }));
    expect(s.avaliacao!.preco).toBe('66.67');
    expect(s.minimoComprovado).toBe(true);
  });
  it('meta não cabe antes do limite: primeira faixa que comporta é a segunda (R$ 120,00)', () => {
    const c = ctx({ entrada: base('60', '25'), tabela: tab });
    const s = resolver(c);
    expect(s.avaliacao!.preco).toBe('120.00');
    const r7899 = avaliar(c, d('78.99'));
    expect(r7899.ok && r7899.g.lt(0)).toBe(true);
    expect(s.diagnostico.join('\n')).toContain('meta não atingida');
    expect(s.diagnostico.join('\n')).toContain('primeira faixa que comporta a meta');
  });
  it('solução exatamente na fronteira de uma faixa de tarifa (tarifa fixa abaixo de R$ 79)', () => {
    const regra: RegraTarifa = {
      tipoAnuncio: 'gold_special',
      faixas: [
        { precoMin: '0', precoMax: '79', percentual: '10', fixa: '6' },
        { precoMin: '79', percentual: '10', fixa: '0' },
      ],
      fonte: 'teste',
    };
    const s = resolver(ctx({ entrada: entradaBase({ custos: { ...entradaBase().custos, compraUnitaria: '50' }, margemAlvoPct: '20' }), regraTarifa: regra }));
    expect(s.avaliacao!.preco).toBe('79.00');
    expect(s.diagnostico.join('\n')).toContain('Fronteira');
  });
});

describe('6. Ajustes, falhas e dados fiscais', () => {
  it('ajuste manual do componente percentual substitui o valor consultado e mantém a tarifa fixa', async () => {
    const { prov } = provedorAPI(() => ({ percentual: '16', fixa: '6.50' }));
    const e = entradaBase({ margemAlvoPct: '25', tarifas: { base: 'anunciado', ajustes: { gold_special: { escopo: 'percentual', tipo: 'percentual', valor: '15', motivo: 'acordo comercial' } } } });
    const r = await simularCenario(e, 'gold_special', 'simples', { perfil: perfilZero(), provedor: prov, modoDemo: false });
    expect(r.status).toBe('validado');
    // 0,60P ≥ 606,50 → P ≈ 1010,8333. Em R$ 1010,83: tarifa = 151,62 (15% arredondado) + 6,50 = 158,12;
    // resultado = 1010,83 − 600 − 158,12 = 252,71 ≥ 25% × 1010,83 = 252,7075 → atinge a meta.
    expect(r.avaliacao!.preco).toBe('1010.83');
    const linha = r.avaliacao!.memoria.find((l) => l.chave === 'tarifa')!;
    expect(linha.manual).toBe(true);
    expect(linha.detalhe).toContain('Valor consultado');
    expect(r.avaliacao!.tarifa).toBe('158.12');
    expect(r.tarifaInfo!.consultado!.total).toBe('168.23'); // valor consultado: 16% × 1010,83 = 161,73 + 6,50 exibido ao lado do ajuste
  });

  it('tarifa da API (sem faixa conhecida): iteração confirma a tarifa no preço final com poucas consultas', async () => {
    // tarifa fixa de R$ 6,00 abaixo de R$ 79,00; 12% em qualquer preço
    const { prov, chamadas } = provedorAPI((p) => ({ percentual: '12', fixa: p < 79 ? '6' : '0' }));
    const e = entradaBase({ custos: { ...entradaBase().custos, compraUnitaria: '40' }, margemAlvoPct: '20' });
    const r = await simularCenario(e, 'gold_special', 'simples', { perfil: perfilZero(), provedor: prov, modoDemo: false });
    expect(r.status).toBe('validado');
    expect(r.mensagem).toContain('não é possível afirmar que é o menor');
    expect(r.avaliacao!.preco).toBe('67.65'); // 0,68P − 6 ≥ 40 → P ≥ 67,65 (abaixo de R$ 79, regra com tarifa fixa)
    expect(chamadas.length).toBeLessThan(6);
    expect(r.tarifaInfo!.consultado!.precoConsultado).toBe(r.avaliacao!.baseTarifa);
  });

  it('API indisponível: simulação mantida e entrada manual oferecida', async () => {
    const e = entradaBase();
    const r = await simularCenario(e, 'gold_special', 'simples', { perfil: perfilZero(), provedor: provedorIndisponivel, modoDemo: false });
    expect(r.status).toBe('pendente');
    expect(r.mensagem).toContain('503');
    expect(r.pendencias.join()).toContain('informe a tarifa total manualmente');
    expect(r.avaliacao).toBeUndefined();
    // com ajuste manual total o cálculo segue, com aviso da consulta falha
    const e2 = entradaBase({ tarifas: { base: 'anunciado', ajustes: { gold_special: { escopo: 'total', tipo: 'percentual', valor: '15' } } }, margemAlvoPct: '25' });
    const r2 = await simularCenario(e2, 'gold_special', 'simples', { perfil: perfilZero(), provedor: provedorIndisponivel, modoDemo: false });
    expect(r2.avaliacao!.preco).toBe('1000.00');
    expect(r2.avisos.join()).toContain('Consulta da tarifa original indisponível');
  });

  it('tabela de frete vencida', () => {
    const e = entradaBase({ frete: { modo: 'tabela', tabelaId: 'tab-teste' }, dataReferencia: '2027-01-15' });
    const p = perfilZero();
    p.simples!.vigenciaFim = undefined;
    const s = resolver(ctx({ entrada: e, tabela: tabelaFrete(), perfil: p }));
    expect(s.status).toBe('inviavel');
    expect(s.motivos.join()).toContain('fora da vigência');
  });

  it('tabela fictícia bloqueada fora do modo de demonstração', () => {
    const e = entradaBase({ frete: { modo: 'tabela', tabelaId: 'tab-teste' } });
    const s = resolver(ctx({ entrada: e, tabela: tabelaFrete({ demo: true }) }));
    expect(s.motivos.join()).toContain('modo de demonstração');
  });

  it('dado fiscal ausente gera pendência (não usa percentual presumido)', () => {
    const p = perfilZero();
    p.simples!.aliquotaEfetiva = { estado: 'nao_informado' };
    const s = resolver(ctx({ perfil: p }));
    expect(s.status).toBe('pendente');
    expect(s.pendencias.join()).toContain('alíquota efetiva do DAS');
  });

  it('Simples: incidência adicional já incluída no DAS não é somada novamente', () => {
    const p = perfilZero();
    p.simples!.aliquotaEfetiva = { estado: 'informado', valor: '8' };
    p.simples!.adicionais = [
      { id: 'a1', tributo: 'ICMS', descricao: 'ICMS (duplicado)', aliquota: { estado: 'informado', valor: '12' }, base: 'receita_vendedor' },
      { id: 'a2', tributo: 'DIFAL', descricao: 'DIFAL', aliquota: { estado: 'informado', valor: '2' }, base: 'pago_comprador' },
    ];
    const r = avaliar(ctx({ perfil: p }), d('1000'));
    expect(r.ok && r.av.tributosLiquidos).toBe('100.00'); // 8% + 2%, sem os 12% de ICMS
  });

  it('provisão IRPJ/CSLL pendente: resultado antes da provisão e margem final pendente', async () => {
    const p = perfilZero({ regimeAtual: 'lucro_real' });
    p.lucroReal!.provisao = { estado: 'nao_informado' };
    const e = entradaBase({ tarifas: { base: 'anunciado', ajustes: { gold_special: { escopo: 'total', tipo: 'percentual', valor: '0' } } } });
    const r = await simularCenario(e, 'gold_special', 'lucro_real', { perfil: p, provedor: provedorIndisponivel, modoDemo: false });
    expect(r.margemFinalPendente).toBe(true);
    expect(r.avaliacao!.provisao).toBeNull();
    expect(r.avaliacao!.preco).toBe('1000.00');
    expect(r.mensagem).toContain('Margem final pendente');
  });

  it('provisão informada (34% do resultado) é identificada e eleva o preço', () => {
    const p = perfilZero({ regimeAtual: 'lucro_real' });
    p.lucroReal!.provisao = { estado: 'informado', metodo: 'percentual_resultado', valor: '34', criterio: 'IRPJ+CSLL marginal' };
    const s = resolver(ctx({ perfil: p, regime: 'lucro_real' }));
    // 0,66 (P − 600) ≥ 0,4P → P ≈ 1523,077. Em R$ 1523,07: provisão = 34% × 923,07 = 313,84;
    // resultado 609,23 ≥ 40% × 1523,07 = 609,228 → atinge a meta (arredondamento por componente).
    expect(s.avaliacao!.preco).toBe('1523.07');
    expect(s.avaliacao!.provisao).toBe('313.84');
    expect(s.avaliacao!.memoria.some((l) => l.chave === 'provisao' && l.rotulo.includes('Provisão'))).toBe(true);
  });

  it('crédito já abatido do custo de aquisição não é aproveitado de novo', () => {
    const p = perfilZero({ regimeAtual: 'lucro_real' });
    p.lucroReal!.creditos = [
      { id: 'c1', tributo: 'PIS', descricao: 'PIS/COFINS sobre compra', tipo: 'percentual', valor: { estado: 'informado', valor: '9.25' }, base: 'custo_compra', jaAbatidoDoCusto: true },
    ];
    const s = resolver(ctx({ perfil: p, regime: 'lucro_real' }));
    expect(s.avaliacao!.preco).toBe('1000.00');
    expect(s.avaliacao!.tributosLiquidos).toBe('0.00');
    expect(s.avisos.join()).toContain('já foi abatido do custo');
    // o mesmo crédito, quando não abatido, reduz os tributos em 9,25% × 600 = 55,50
    p.lucroReal!.creditos[0].jaAbatidoDoCusto = false;
    const r = avaliar(ctx({ perfil: p, regime: 'lucro_real' }), d('1000'));
    expect(r.ok && r.av.tributosLiquidos).toBe('-55.50');
  });

  it('meta inviável explica a condição', () => {
    const s = resolver(ctx({ regraTarifa: { tipoAnuncio: 'gold_special', ajuste: { escopo: 'total', tipo: 'percentual', valor: '65' }, fonte: 't' } }));
    expect(s.status).toBe('inviavel');
    expect(s.motivos.join()).toContain('consomem 100% ou mais da receita');
  });
});

describe('Comparação de regimes', () => {
  it('quatro cenários com as mesmas premissas operacionais', async () => {
    const p = perfilZero();
    p.simples!.aliquotaEfetiva = { estado: 'informado', valor: '10' };
    p.lucroReal!.tributos = [{ id: 't', tributo: 'ICMS', descricao: 'ICMS', aliquota: { estado: 'informado', valor: '5' }, base: 'receita_vendedor' }];
    const prov = provedorFaixas({ gold_special: [{ precoMin: '0', percentual: '10', fixa: '0' }], gold_pro: [{ precoMin: '0', percentual: '15', fixa: '0' }] });
    const res = await simular(entradaBase({ tributacao: { modo: 'comparar' } }), { perfil: p, provedor: prov, modoDemo: true });
    expect(res.cenarios.map((c) => `${c.tipoAnuncio}/${c.regime}`)).toEqual(['gold_special/simples', 'gold_pro/simples', 'gold_special/lucro_real', 'gold_pro/lucro_real']);
    // Clássico/Simples: 600 / (1 − 0,4 − 0,1 − 0,1) = 1500
    expect(res.cenarios[0].avaliacao!.preco).toBe('1500.00');
    // Premium/Lucro Real: 600 / (1 − 0,4 − 0,15 − 0,05) = 1500
    expect(res.cenarios[3].avaliacao!.preco).toBe('1500.00');
    expect(res.diferencasPremissas.length).toBeGreaterThan(1);
  });
});

it('cotação exata da API é usada no preço final', () => {
  const regra: RegraTarifa = { tipoAnuncio: 'gold_special', cotacao: cot('gold_special', '1000.00', '151.23', '15', '0'), fonte: 'API' };
  const r = avaliar(ctx({ regraTarifa: regra }), d('1000'));
  expect(r.ok && r.av.tarifa).toBe('151.23');
});
