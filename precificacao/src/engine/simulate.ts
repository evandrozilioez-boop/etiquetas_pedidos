import { Decimal, d, fromCents } from './decimal';
import { avaliar, bases, calcularReceita, type Contexto } from './evaluate';
import { percentualEfetivo } from './fees';
import { resolver, type Solucao } from './solver';
import type {
  CotacaoTarifa, EntradaSimulacao, FaixaTarifa, Logistica, PerfilCnpj, Regime, RegraTarifa, ResultadoCenario, TabelaFrete, TipoAnuncio,
} from './types';
import { NOME_REGIME, NOME_TIPO_ANUNCIO } from './types';

export interface ParamConsulta {
  categoriaId: string;
  tipoAnuncio: TipoAnuncio;
  logistica: Logistica;
  quantidade: number;
}

/** Fonte de tarifas (API oficial, demonstração ou dublê de teste). */
export interface ProvedorTarifa {
  nome: string;
  demo: boolean;
  /** Faixas completas, quando a fonte conhece a regra para qualquer preço. */
  faixas?(p: ParamConsulta): Promise<FaixaTarifa[] | null>;
  cotar(p: ParamConsulta & { preco: string }): Promise<CotacaoTarifa>;
}

export interface Dependencias {
  perfil?: PerfilCnpj;
  tabela?: TabelaFrete;
  provedor: ProvedorTarifa;
  modoDemo: boolean;
}

export interface ResultadoSimulacao {
  geradoEm: string;
  modoDemo: boolean;
  modoTributario: EntradaSimulacao['tributacao']['modo'];
  cenarios: ResultadoCenario[];
  diferencasPremissas: string[];
}

const MAX_ITERACOES = 8;

function mesmaRegra(a: CotacaoTarifa, b: CotacaoTarifa) {
  return percentualEfetivo(a).toDecimalPlaces(6).eq(percentualEfetivo(b).toDecimalPlaces(6)) && d(a.fixa).eq(d(b.fixa));
}

function baseTarifaEm(e: EntradaSimulacao, centavos: number): Decimal {
  return bases(calcularReceita(e, fromCents(centavos)))[e.tarifas.base];
}

function msgErro(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

export async function simularCenario(entrada: EntradaSimulacao, tipo: TipoAnuncio, regime: Regime, dep: Dependencias): Promise<ResultadoCenario> {
  const ajuste = entrada.tarifas.ajustes[tipo];
  const nomeTA = NOME_TIPO_ANUNCIO[tipo];
  const ctxBase = (regra: RegraTarifa): Contexto => ({ entrada, regraTarifa: regra, tabela: dep.tabela, perfil: dep.perfil, regime, modoDemo: dep.modoDemo });
  const consulta: ParamConsulta | null = entrada.categoria?.id
    ? { categoriaId: entrada.categoria.id, tipoAnuncio: tipo, logistica: entrada.logistica, quantidade: 1 }
    : null;
  let consultas = 0;
  const cotar = async (preco: Decimal) => {
    consultas++;
    return dep.provedor.cotar({ ...consulta!, preco: preco.toFixed(2) });
  };
  const vazio = (regra: RegraTarifa, extra: Partial<ResultadoCenario>): ResultadoCenario => {
    const s = resolver(ctxBase(regra));
    return montar(s, regra, extra);
  };
  const montar = (s: Solucao, regra: RegraTarifa, extra: Partial<ResultadoCenario> = {}, validadoSomente = false): ResultadoCenario => {
    const margemFinalPendente = !!s.avaliacao && s.avaliacao.provisao === null;
    const status: ResultadoCenario['status'] = s.status === 'encontrado' ? (s.minimoComprovado && !validadoSomente ? 'minimo_comprovado' : 'validado') : s.status;
    let mensagem = '';
    if (status === 'minimo_comprovado') mensagem = 'Menor preço em centavos que atinge a meta, comprovado em todas as faixas de tarifa e frete.';
    else if (status === 'validado')
      mensagem =
        extra.mensagem ??
        'Preço validado para a meta: a tarifa foi confirmada para este preço, mas a fonte não informa a faixa de validade da regra; não é possível afirmar que é o menor preço possível.';
    else if (status === 'pendente') mensagem = 'Faltam dados essenciais para calcular.';
    else mensagem = s.motivos.join(' ') || 'Meta inviável.';
    if (margemFinalPendente) mensagem += ' Margem final pendente: falta o critério de provisão de IRPJ/CSLL.';
    return {
      tipoAnuncio: tipo,
      regime,
      status,
      mensagem,
      pendencias: [...s.pendencias, ...(extra.pendencias ?? [])],
      avisos: [...new Set([...s.avisos, ...(extra.avisos ?? [])])],
      margemFinalPendente,
      avaliacao: s.avaliacao,
      diagnostico: [...s.diagnostico, ...(extra.diagnostico ?? [])],
      tarifaInfo: { fonte: regra.fonte, consultado: regra.cotacao, ajuste: regra.ajuste, consultas },
    };
  };

  // 1) Fonte com faixas conhecidas (demonstração): mínimo global comprovável.
  if (consulta && dep.provedor.faixas) {
    try {
      const faixas = await dep.provedor.faixas(consulta);
      if (faixas) {
        const regra: RegraTarifa = { tipoAnuncio: tipo, faixas, ajuste, fonte: dep.provedor.nome };
        const s = resolver(ctxBase(regra));
        if (s.status === 'encontrado' && s.precoCentavos) {
          const cot = await cotar(baseTarifaEm(entrada, s.precoCentavos));
          return montar(s, { ...regra, cotacao: cot });
        }
        return montar(s, regra);
      }
    } catch (err) {
      return falhaConsulta(err);
    }
  }

  // 2) Ajuste manual da tarifa TOTAL: regra conhecida em todo preço; consulta só para exibir o valor original.
  if (ajuste?.escopo === 'total') {
    const regra: RegraTarifa = { tipoAnuncio: tipo, ajuste, fonte: 'Ajuste manual' };
    const s = resolver(ctxBase(regra));
    const avisos: string[] = [];
    let regraFinal = regra;
    if (s.status === 'encontrado' && s.precoCentavos && consulta) {
      try {
        const cot = await cotar(baseTarifaEm(entrada, s.precoCentavos));
        regraFinal = { ...regra, cotacao: cot, fonte: `Ajuste manual sobre ${cot.fonte}` };
        const r = avaliar(ctxBase(regraFinal), fromCents(s.precoCentavos));
        if (r.ok) s.avaliacao = r.av;
      } catch (err) {
        avisos.push(`Consulta da tarifa original indisponível (${msgErro(err)}); usado somente o ajuste manual`);
      }
    }
    return montar(s, regraFinal, { avisos });
  }

  if (!consulta) {
    return vazio({ tipoAnuncio: tipo, ajuste, fonte: '—' }, {});
  }

  // 3) API: tarifa observada ponto a ponto. Itera até a regra usada coincidir com a consultada no preço final.
  const pre = resolver(ctxBase({ tipoAnuncio: tipo, ajuste: { escopo: 'total', tipo: 'percentual', valor: '0' }, fonte: 'estimativa inicial' }));
  if (pre.status === 'pendente') return montar(pre, { tipoAnuncio: tipo, ajuste, fonte: dep.provedor.nome });
  let cot: CotacaoTarifa;
  try {
    cot = await cotar(baseTarifaEm(entrada, pre.precoCentavos ?? 10000));
  } catch (err) {
    return falhaConsulta(err);
  }
  const candidatos: { centavos: number; solucao: Solucao; regra: RegraTarifa }[] = [];
  const vistos = new Set<string>();
  for (let it = 0; it < MAX_ITERACOES; it++) {
    const regra: RegraTarifa = { tipoAnuncio: tipo, cotacao: cot, ajuste, fonte: cot.fonte };
    const s = resolver(ctxBase(regra));
    if (s.status !== 'encontrado' || !s.precoCentavos) {
      if (candidatos.length) break;
      return montar(s, regra, {
        mensagem: undefined,
        diagnostico: [`Regra consultada em R$ ${cot.precoConsultado.replace('.', ',')}: ${percentualEfetivo(cot).toDecimalPlaces(4)}% + R$ ${cot.fixa} de tarifa fixa`],
      });
    }
    const baseFinal = baseTarifaEm(entrada, s.precoCentavos);
    let cotFinal: CotacaoTarifa;
    try {
      cotFinal = baseFinal.eq(d(cot.precoConsultado)) ? cot : await cotar(baseFinal);
    } catch (err) {
      return falhaConsulta(err);
    }
    const regraConf: RegraTarifa = { ...regra, cotacao: cotFinal, fonte: cotFinal.fonte };
    const conf = avaliar(ctxBase(regraConf), fromCents(s.precoCentavos));
    if (conf.ok && conf.g.gte(0)) {
      candidatos.push({ centavos: s.precoCentavos, solucao: { ...s, avaliacao: conf.av }, regra: regraConf });
      if (mesmaRegra(cot, cotFinal)) break; // regra estável: preço confirmado
    }
    const chave = `${percentualEfetivo(cotFinal).toFixed(6)}|${cotFinal.fixa}|${s.precoCentavos}`;
    if (vistos.has(chave)) break;
    vistos.add(chave);
    cot = cotFinal;
  }
  if (!candidatos.length) {
    return montar(
      { status: 'inviavel', minimoComprovado: false, pendencias: [], motivos: ['Não foi possível confirmar na API um preço que atinja a meta: a tarifa consultada muda entre os preços candidatos. Informe a tarifa manualmente.'], avisos: [], diagnostico: [], avaliacoes: 0 },
      { tipoAnuncio: tipo, cotacao: cot, ajuste, fonte: cot.fonte },
    );
  }
  candidatos.sort((a, b) => a.centavos - b.centavos);
  const melhor = candidatos[0];
  return montar(melhor.solucao, melhor.regra, {}, true);

  function falhaConsulta(err: unknown): ResultadoCenario {
    return {
      tipoAnuncio: tipo,
      regime,
      status: 'pendente',
      mensagem: `Consulta de tarifa ${nomeTA} falhou: ${msgErro(err)}. A simulação foi mantida; informe a tarifa manualmente (escopo "tarifa total") para continuar.`,
      pendencias: [`Tarifa ${nomeTA}: consulta indisponível — informe a tarifa total manualmente`],
      avisos: [],
      margemFinalPendente: false,
      tarifaInfo: { fonte: dep.provedor.nome, consultas },
      diagnostico: [],
    };
  }
}

export function regimesDaSimulacao(entrada: EntradaSimulacao, perfil?: PerfilCnpj): Regime[] {
  if (entrada.tributacao.modo === 'comparar') return ['simples', 'lucro_real'];
  return [perfil?.regimeAtual ?? 'simples'];
}

export function diferencasPremissas(perfil?: PerfilCnpj): string[] {
  if (!perfil) return [];
  const out: string[] = [];
  const s = perfil.simples, r = perfil.lucroReal;
  out.push(`Mesma operação, preço, tarifa, frete e despesas nos dois regimes; muda apenas a tributação.`);
  if (s) {
    const a = s.aliquotaEfetiva;
    out.push(`${NOME_REGIME.simples}: DAS ${a.estado === 'informado' ? `${a.valor}%` : a.estado.replace('_', ' ')} sobre ${s.percentualBase}% da base "${s.base.replace('_', ' ')}"; inclui ${s.tributosNoDAS.join(', ') || '—'}; ${s.adicionais.length} incidência(s) adicional(is); sem provisão separada de IRPJ/CSLL. Vigência ${s.vigenciaInicio} a ${s.vigenciaFim ?? 'sem fim'}.`);
  } else out.push(`${NOME_REGIME.simples}: parâmetros não cadastrados.`);
  if (r) {
    const trib = r.tributos.map((t) => `${t.tributo} ${t.aliquota.estado === 'informado' ? `${t.aliquota.valor}%` : t.aliquota.estado.replace('_', ' ')}`).join(', ');
    const cred = r.creditos.map((c) => `${c.tributo}${c.jaAbatidoDoCusto ? ' (já abatido do custo)' : ''}`).join(', ');
    const p = r.provisao;
    out.push(`${NOME_REGIME.lucro_real}: tributos ${trib || '—'}; créditos ${cred || 'nenhum'}; provisão IRPJ/CSLL ${p.estado === 'informado' ? `${p.metodo?.replace('_', ' ')} ${p.valor}` : 'PENDENTE'}. Vigência ${r.vigenciaInicio} a ${r.vigenciaFim ?? 'sem fim'}.`);
  } else out.push(`${NOME_REGIME.lucro_real}: parâmetros não cadastrados.`);
  return out;
}

export async function simular(entrada: EntradaSimulacao, dep: Dependencias): Promise<ResultadoSimulacao> {
  const regimes = regimesDaSimulacao(entrada, dep.perfil);
  const cenarios: ResultadoCenario[] = [];
  for (const regime of regimes) {
    for (const tipo of ['gold_special', 'gold_pro'] as TipoAnuncio[]) {
      cenarios.push(await simularCenario(entrada, tipo, regime, dep));
    }
  }
  return {
    geradoEm: new Date().toISOString(),
    modoDemo: dep.modoDemo,
    modoTributario: entrada.tributacao.modo,
    cenarios,
    diferencasPremissas: entrada.tributacao.modo === 'comparar' ? diferencasPremissas(dep.perfil) : [],
  };
}
