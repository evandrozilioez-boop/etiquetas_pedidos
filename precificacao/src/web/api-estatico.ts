/**
 * Versão de demonstração que roda só no navegador (sem servidor): mesmo motor,
 * dados fictícios e configurações gravadas no armazenamento local do navegador.
 */
import { validarCSVFrete } from '../engine/csv';
import { simular } from '../engine/simulate';
import type { EntradaSimulacao, PerfilCnpj, Produto, TabelaFrete } from '../engine/types';
import { categoriasDemo, perfilDemo, provedorDemo, tabelaDemo } from '../server/demo';
import type { Categoria, Status } from './api';

const CHAVE = 'precificacao-ml:config:v1';
type Dados = { perfis: PerfilCnpj[]; tabelas: TabelaFrete[]; produtos: Produto[] };
function ler(): Dados {
  try {
    const s = localStorage.getItem(CHAVE);
    if (s) return { perfis: [], tabelas: [], produtos: [], ...JSON.parse(s) };
  } catch { /* indisponível */ }
  return { perfis: [], tabelas: [], produtos: [] };
}
function gravar(d: Dados) {
  try { localStorage.setItem(CHAVE, JSON.stringify(d)); } catch { /* indisponível */ }
}

export const apiEstatica = {
  status: async (): Promise<Status> => ({
    modo: 'demo',
    motivo: 'versão de demonstração que roda no navegador, sem servidor e sem acesso à API do Mercado Livre',
    fonteTarifas: provedorDemo.nome,
    documentacao: 'https://developers.mercadolivre.com.br/pt_br/comissao-por-vender',
  }),
  categorias: async (q: string): Promise<{ itens: Categoria[]; fonte?: string; aviso?: string }> => ({
    itens: categoriasDemo.filter((c) => `${c.id} ${c.nome}`.toLowerCase().includes(q.toLowerCase())),
    fonte: 'lista offline de demonstração',
    aviso: 'busca na API indisponível nesta versão; digite o ID MLB',
  }),
  perfis: async () => [perfilDemo, ...ler().perfis],
  salvarPerfil: async (p: PerfilCnpj) => {
    if (!p.cnpj || !p.razaoSocial) throw new Error('Perfil inválido (CNPJ e razão social são obrigatórios)');
    const d = ler();
    d.perfis = [...d.perfis.filter((x) => x.id !== p.id), p];
    gravar(d);
    return p;
  },
  excluirPerfil: async (id: string) => {
    const d = ler();
    d.perfis = d.perfis.filter((x) => x.id !== id);
    gravar(d);
  },
  tabelas: async () => [tabelaDemo, ...ler().tabelas],
  salvarTabela: async (t: TabelaFrete) => {
    if (!t.nome || !t.fonte || !t.logisticas.length) throw new Error('Tabela inválida (nome, fonte e modalidade são obrigatórios)');
    const d = ler();
    d.tabelas = [...d.tabelas.filter((x) => x.id !== t.id), t];
    gravar(d);
    return t;
  },
  excluirTabela: async (id: string) => {
    const d = ler();
    d.tabelas = d.tabelas.filter((x) => x.id !== id);
    gravar(d);
  },
  produtos: async () => [...ler().produtos].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
  salvarProduto: async (p: Produto) => {
    if (!p.nome.trim()) throw new Error('Informe o nome do produto');
    const d = ler();
    d.produtos = [...d.produtos.filter((x) => x.id !== p.id), p];
    gravar(d);
    return p;
  },
  excluirProduto: async (id: string) => {
    const d = ler();
    d.produtos = d.produtos.filter((x) => x.id !== id);
    gravar(d);
  },
  previaCSV: async (csv: string) => validarCSVFrete(csv),
  simular: async (e: EntradaSimulacao) => {
    const perfis = [perfilDemo, ...ler().perfis];
    const tabelas = [tabelaDemo, ...ler().tabelas];
    return simular(e, {
      perfil: perfis.find((p) => p.id === e.perfilId),
      tabela: e.frete.modo === 'tabela' ? tabelas.find((t) => t.id === e.frete.tabelaId) : undefined,
      provedor: provedorDemo,
      modoDemo: true,
    });
  },
};
