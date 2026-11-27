import { Decimal, d, money, isNumeric, ZERO } from './decimal';
import type { BasePreco, Credito, Incidencia, Parametro, PerfilCnpj, ProvisaoIR, Regime } from './types';
import { NOME_BASE } from './types';

export interface LinhaTributo {
  chave: string;
  rotulo: string;
  valor: Decimal; // custo (positivo) ou crédito (negativo)
  detalhe: string;
  informativo?: boolean; // exibido mas não somado
}

export interface ResultadoTributos {
  linhas: LinhaTributo[];
  total: Decimal; // tributos líquidos (custos − créditos)
  provisao: ProvisaoIR | null; // só Lucro Real
}

const fmtPct = (v: Decimal | string) => `${d(v as string).toString().replace('.', ',')}%`;
const fmtR = (v: Decimal) => `R$ ${v.toFixed(2).replace('.', ',')}`;

function estadoTxt(p: Parametro): string {
  return p.estado === 'zero_confirmado' ? 'zero confirmado' : p.estado === 'nao_se_aplica' ? 'não se aplica' : p.estado === 'nao_informado' ? 'não informado' : '';
}

function checaParametro(p: Parametro | undefined, nome: string, pend: string[]) {
  if (!p || p.estado === 'nao_informado') pend.push(`${nome}: não informado`);
  else if (p.estado === 'informado' && (!isNumeric(p.valor) || d(p.valor).lt(0))) pend.push(`${nome}: valor inválido`);
}

function vigente(v: { vigenciaInicio: string; vigenciaFim?: string }, data: string) {
  return !(data < v.vigenciaInicio || (v.vigenciaFim && data > v.vigenciaFim));
}

/** Verifica dados fiscais que não dependem do preço. */
export function prevalidarTributos(perfil: PerfilCnpj | undefined, regime: Regime, data: string, modoDemo: boolean): { pendencias: string[]; motivos: string[]; avisos: string[] } {
  const pendencias: string[] = [];
  const motivos: string[] = [];
  const avisos: string[] = [];
  if (!perfil) {
    pendencias.push('CNPJ vendedor: selecione um perfil fiscal');
    return { pendencias, motivos, avisos };
  }
  if (perfil.demo && !modoDemo) motivos.push('Perfil fiscal fictício só pode ser usado no modo de demonstração');
  if (regime === 'simples') {
    const s = perfil.simples;
    if (!s) {
      pendencias.push(`Perfil ${perfil.razaoSocial}: parâmetros do Simples Nacional não cadastrados`);
      return { pendencias, motivos, avisos };
    }
    if (!vigente(s, data)) motivos.push(`Parâmetros do Simples fora da vigência (${s.vigenciaInicio} a ${s.vigenciaFim ?? 'sem fim'}) na data ${data}`);
    checaParametro(s.aliquotaEfetiva, 'Simples: alíquota efetiva do DAS', pendencias);
    if (!isNumeric(s.percentualBase) || d(s.percentualBase).lt(0) || d(s.percentualBase).gt(100)) pendencias.push('Simples: parcela da base sujeita ao DAS (%)');
    for (const a of s.adicionais) {
      if (s.tributosNoDAS.includes(a.tributo)) {
        avisos.push(`Simples: ${a.tributo} (${a.descricao}) já consta como incluído no DAS — não foi somado novamente`);
        continue;
      }
      if (!a.jaIncluidoNoCusto) checaParametro(a.aliquota, `Simples: ${a.descricao || a.tributo}`, pendencias);
    }
  } else {
    const r = perfil.lucroReal;
    if (!r) {
      pendencias.push(`Perfil ${perfil.razaoSocial}: parâmetros do Lucro Real não cadastrados`);
      return { pendencias, motivos, avisos };
    }
    if (!vigente(r, data)) motivos.push(`Parâmetros do Lucro Real fora da vigência (${r.vigenciaInicio} a ${r.vigenciaFim ?? 'sem fim'}) na data ${data}`);
    if (!r.tributos.length) pendencias.push('Lucro Real: nenhum tributo da operação cadastrado (cadastre-os ou marque "zero confirmado")');
    for (const t of r.tributos) if (!t.jaIncluidoNoCusto) checaParametro(t.aliquota, `Lucro Real: ${t.descricao || t.tributo}`, pendencias);
    for (const c of r.creditos) {
      if (c.jaAbatidoDoCusto) {
        avisos.push(`Lucro Real: crédito de ${c.tributo} (${c.descricao}) já foi abatido do custo de aquisição — não aproveitado novamente`);
        continue;
      }
      checaParametro(c.valor, `Lucro Real: crédito ${c.descricao || c.tributo}`, pendencias);
    }
    const p = r.provisao;
    if (p.estado === 'informado') {
      if (!p.metodo || !isNumeric(p.valor) || d(p.valor).lt(0)) pendencias.push('Lucro Real: critério da provisão de IRPJ/CSLL incompleto');
    }
  }
  return { pendencias, motivos, avisos };
}

function incidencia(i: Incidencia, bases: Record<BasePreco, Decimal>, prefixo: string): LinhaTributo {
  const base = bases[i.base];
  const nome = `${prefixo}${i.descricao || i.tributo}`;
  if (i.jaIncluidoNoCusto) return { chave: `trib_${i.id}`, rotulo: nome, valor: ZERO, detalhe: 'já incluído no custo de aquisição — não somado', informativo: true };
  if (i.aliquota.estado !== 'informado') return { chave: `trib_${i.id}`, rotulo: nome, valor: ZERO, detalhe: estadoTxt(i.aliquota), informativo: i.aliquota.estado === 'nao_se_aplica' };
  const v = money(base.mul(d(i.aliquota.valor)).div(100));
  return { chave: `trib_${i.id}`, rotulo: nome, valor: v, detalhe: `${fmtPct(i.aliquota.valor!)} × ${NOME_BASE[i.base]} ${fmtR(base)}` };
}

function credito(c: Credito, custoCompra: Decimal): LinhaTributo {
  const nome = `Crédito ${c.descricao || c.tributo}`;
  if (c.jaAbatidoDoCusto) return { chave: `cred_${c.id}`, rotulo: nome, valor: ZERO, detalhe: 'já abatido do custo de aquisição — não aproveitado novamente', informativo: true };
  if (c.valor.estado !== 'informado') return { chave: `cred_${c.id}`, rotulo: nome, valor: ZERO, detalhe: estadoTxt(c.valor), informativo: true };
  const v = c.tipo === 'percentual' ? money(custoCompra.mul(d(c.valor.valor)).div(100)) : money(d(c.valor.valor));
  return {
    chave: `cred_${c.id}`,
    rotulo: nome,
    valor: v.neg(),
    detalhe: c.tipo === 'percentual' ? `${fmtPct(c.valor.valor!)} × custo de compra ${fmtR(custoCompra)}` : 'valor por venda informado pelo contador',
  };
}

export function calcularTributos(perfil: PerfilCnpj, regime: Regime, bases: Record<BasePreco, Decimal>, custoCompra: Decimal): ResultadoTributos {
  const linhas: LinhaTributo[] = [];
  if (regime === 'simples') {
    const s = perfil.simples!;
    const base = bases[s.base].mul(d(s.percentualBase)).div(100);
    if (s.aliquotaEfetiva.estado === 'informado') {
      linhas.push({
        chave: 'das',
        rotulo: 'Simples Nacional (DAS)',
        valor: money(base.mul(d(s.aliquotaEfetiva.valor)).div(100)),
        detalhe: `${fmtPct(s.aliquotaEfetiva.valor!)} × ${s.percentualBase.replace('.', ',')}% da base "${NOME_BASE[s.base]}" (${fmtR(bases[s.base])}). Inclui: ${s.tributosNoDAS.join(', ') || 'não especificado'}`,
      });
    } else {
      linhas.push({ chave: 'das', rotulo: 'Simples Nacional (DAS)', valor: ZERO, detalhe: estadoTxt(s.aliquotaEfetiva), informativo: s.aliquotaEfetiva.estado === 'nao_se_aplica' });
    }
    for (const a of s.adicionais) {
      if (s.tributosNoDAS.includes(a.tributo)) {
        linhas.push({ chave: `trib_${a.id}`, rotulo: a.descricao || a.tributo, valor: ZERO, detalhe: 'já incluído no DAS — não somado novamente', informativo: true });
        continue;
      }
      linhas.push(incidencia(a, bases, 'Adicional: '));
    }
    return { linhas, total: linhas.reduce((t, l) => (l.informativo ? t : t.plus(l.valor)), ZERO), provisao: null };
  }
  const r = perfil.lucroReal!;
  for (const t of r.tributos) linhas.push(incidencia(t, bases, ''));
  for (const c of r.creditos) linhas.push(credito(c, custoCompra));
  return { linhas, total: linhas.reduce((t, l) => (l.informativo ? t : t.plus(l.valor)), ZERO), provisao: r.provisao };
}

/** Provisão gerencial de IRPJ/CSLL atribuída à venda (critério do contador). null = pendente. */
export function calcularProvisao(p: ProvisaoIR | null, resultadoAntes: Decimal, receita: Decimal): { valor: Decimal | null; detalhe: string } {
  if (!p) return { valor: ZERO, detalhe: 'não se aplica (IRPJ/CSLL no DAS)' };
  if (p.estado !== 'informado') return { valor: null, detalhe: 'critério de provisão não informado pelo contador — margem final pendente' };
  const v = d(p.valor);
  switch (p.metodo) {
    case 'percentual_resultado':
      return { valor: resultadoAntes.gt(0) ? money(resultadoAntes.mul(v).div(100)) : ZERO, detalhe: `${fmtPct(v)} × resultado antes da provisão (${fmtR(resultadoAntes)}), nunca negativa${p.criterio ? ` — ${p.criterio}` : ''}` };
    case 'percentual_receita':
      return { valor: money(receita.mul(v).div(100)), detalhe: `${fmtPct(v)} × receita do vendedor${p.criterio ? ` — ${p.criterio}` : ''}` };
    default:
      return { valor: money(v), detalhe: `valor fixo por venda${p.criterio ? ` — ${p.criterio}` : ''}` };
  }
}
