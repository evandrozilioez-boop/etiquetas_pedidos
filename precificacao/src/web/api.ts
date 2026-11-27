import type { EntradaSimulacao, PerfilCnpj, Produto, TabelaFrete } from '../engine/types';
import type { ResultadoSimulacao } from '../engine/simulate';
import type { PreviaCSV } from '../engine/csv';

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
  if (r.status === 204) return undefined as T;
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    const det = body?.detalhes?.fieldErrors ? Object.entries(body.detalhes.fieldErrors).map(([k, v]) => `${k}: ${(v as string[]).join(', ')}`).join('; ') : '';
    throw new Error(`${body?.erro ?? `Erro HTTP ${r.status}`}${det ? ` (${det})` : ''}`);
  }
  return body as T;
}

export interface Status { modo: 'demo' | 'producao'; motivo: string; fonteTarifas?: string; documentacao: string }
export interface Categoria { id: string; nome: string; caminho?: string }

const apiServidor = {
  status: () => req<Status>('/api/status'),
  categorias: (q: string) => req<{ itens: Categoria[]; fonte?: string; aviso?: string }>(`/api/categorias?q=${encodeURIComponent(q)}`),
  perfis: () => req<PerfilCnpj[]>('/api/perfis'),
  salvarPerfil: (p: PerfilCnpj) => req<PerfilCnpj>(`/api/perfis/${encodeURIComponent(p.id)}`, { method: 'PUT', body: JSON.stringify(p) }),
  excluirPerfil: (id: string) => req<void>(`/api/perfis/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  tabelas: () => req<TabelaFrete[]>('/api/tabelas-frete'),
  salvarTabela: (t: TabelaFrete) => req<TabelaFrete>(`/api/tabelas-frete/${encodeURIComponent(t.id)}`, { method: 'PUT', body: JSON.stringify(t) }),
  excluirTabela: (id: string) => req<void>(`/api/tabelas-frete/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  previaCSV: (csv: string) => req<PreviaCSV>('/api/tabelas-frete/previa-csv', { method: 'POST', body: JSON.stringify({ csv }) }),
  produtos: () => req<Produto[]>('/api/produtos'),
  salvarProduto: (p: Produto) => req<Produto>(`/api/produtos/${encodeURIComponent(p.id)}`, { method: 'PUT', body: JSON.stringify(p) }),
  excluirProduto: (id: string) => req<void>(`/api/produtos/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  simular: (e: EntradaSimulacao) => req<ResultadoSimulacao>('/api/simular', { method: 'POST', body: JSON.stringify(e) }),
};

import { apiEstatica } from './api-estatico';
export const ESTATICO = import.meta.env.VITE_ESTATICO === '1';
export const api: typeof apiServidor = ESTATICO ? apiEstatica : apiServidor;
/** confirm() não funciona dentro de páginas incorporadas; na versão estática confirma direto. */
export const confirmar = (msg: string) => (ESTATICO ? true : window.confirm(msg));
