import { d } from './decimal';
import type { LinhaFrete } from './types';

/** Converte "1.234,56" / "12,5" / "12.5" em "1234.56". Retorna null se inválido. */
export function parseNumeroBR(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null;
  let s = String(v).replace(/R\$|\s|%/g, '');
  if (s === '') return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return d(s).toString();
}

export const CABECALHO_CSV = ['preco_min', 'preco_max', 'peso_min_kg', 'peso_max_kg', 'regiao', 'custo'];

export const MODELO_CSV = [
  CABECALHO_CSV.join(';'),
  '# preco_min inclusivo; preco_max exclusivo (vazio = sem limite); peso_min exclusivo (0 inclui 0); peso_max inclusivo; regiao vazia = todas; custo = frete que cabe ao vendedor',
  '0,00;79,00;0;0,3;;0,00',
  '0,00;79,00;0,3;1;;0,00',
  '79,00;;0;0,3;;20,00',
  '79,00;;0,3;1;;25,00',
  '79,00;;1;2;;30,00',
].join('\n');

export interface PreviaCSV {
  linhas: LinhaFrete[];
  erros: { linha: number; mensagem: string }[];
  avisos: string[];
}

export function validarCSVFrete(texto: string): PreviaCSV {
  const erros: PreviaCSV['erros'] = [];
  const avisos: string[] = [];
  const linhas: (LinhaFrete & { _n: number })[] = [];
  const brutas = texto.replace(/^﻿/, '').split(/\r?\n/);
  let cabecalhoVisto = false;
  brutas.forEach((raw, i) => {
    const n = i + 1;
    const l = raw.trim();
    if (!l || l.startsWith('#')) return;
    const cols = l.split(';').map((c) => c.trim());
    if (!cabecalhoVisto) {
      cabecalhoVisto = true;
      const cab = cols.map((c) => c.toLowerCase());
      if (cab.join(';') !== CABECALHO_CSV.join(';')) {
        erros.push({ linha: n, mensagem: `Cabeçalho esperado: ${CABECALHO_CSV.join(';')} (separador ponto e vírgula)` });
      }
      return;
    }
    if (cols.length !== CABECALHO_CSV.length) {
      erros.push({ linha: n, mensagem: `Esperadas ${CABECALHO_CSV.length} colunas separadas por ";", encontradas ${cols.length}` });
      return;
    }
    const [pmin, pmax, wmin, wmax, regiao, custo] = cols;
    const v = {
      precoMin: parseNumeroBR(pmin),
      precoMax: pmax ? parseNumeroBR(pmax) : undefined,
      pesoMin: parseNumeroBR(wmin),
      pesoMax: wmax ? parseNumeroBR(wmax) : undefined,
      custo: parseNumeroBR(custo),
    };
    const ruins = Object.entries(v).filter(([, x]) => x === null).map(([k]) => k);
    if (ruins.length) {
      erros.push({ linha: n, mensagem: `Valor inválido em: ${ruins.join(', ')}` });
      return;
    }
    if (d(v.precoMin!).lt(0) || d(v.pesoMin!).lt(0) || d(v.custo!).lt(0)) erros.push({ linha: n, mensagem: 'Valores negativos não são aceitos' });
    if (v.precoMax && d(v.precoMax).lte(d(v.precoMin!))) erros.push({ linha: n, mensagem: 'preco_max deve ser maior que preco_min' });
    if (v.pesoMax && d(v.pesoMax).lte(d(v.pesoMin!))) erros.push({ linha: n, mensagem: 'peso_max_kg deve ser maior que peso_min_kg' });
    linhas.push({
      _n: n,
      precoMin: v.precoMin!,
      precoMax: v.precoMax ?? undefined,
      pesoMin: v.pesoMin!,
      pesoMax: v.pesoMax ?? undefined,
      regiao: regiao || undefined,
      custo: v.custo!,
    });
  });
  if (!cabecalhoVisto) erros.push({ linha: 1, mensagem: 'Arquivo vazio' });
  if (cabecalhoVisto && !linhas.length) erros.push({ linha: 1, mensagem: 'Nenhuma faixa encontrada' });

  // sobreposição: mesma região, intervalos de preço e de peso que se cruzam
  const inf = (x?: string) => (x ? d(x) : d('1e15'));
  for (let i = 0; i < linhas.length; i++) {
    for (let j = i + 1; j < linhas.length; j++) {
      const a = linhas[i], b = linhas[j];
      if ((a.regiao ?? '') !== (b.regiao ?? '')) continue;
      const precoCruza = d(a.precoMin).lt(inf(b.precoMax)) && d(b.precoMin).lt(inf(a.precoMax));
      const pesoCruza = d(a.pesoMin).lt(inf(b.pesoMax)) && d(b.pesoMin).lt(inf(a.pesoMax));
      if (precoCruza && pesoCruza) erros.push({ linha: b._n, mensagem: `Faixa sobreposta à da linha ${a._n}` });
    }
  }
  const regioes = new Set(linhas.map((l) => l.regiao ?? ''));
  if (regioes.size > 1 && regioes.has('')) avisos.push('Há faixas com e sem região: as faixas com região têm prioridade quando a região coincide');
  if (!linhas.some((l) => !l.precoMax)) avisos.push('Nenhuma faixa de preço sem limite superior: preços acima da última faixa não terão frete');
  if (!linhas.some((l) => !l.pesoMax)) avisos.push('Nenhuma faixa de peso sem limite superior: pesos acima da última faixa não terão frete');
  return { linhas: linhas.map(({ _n, ...l }) => l), erros, avisos };
}
