import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import type { EntradaSimulacao, PerfilCnpj, TabelaFrete } from '../engine';
import { MODELO_CSV, validarCSVFrete } from '../engine/csv';
import { simular, type ProvedorTarifa } from '../engine/simulate';
import { categoriasDemo, perfilDemo, provedorDemo, tabelaDemo } from './demo';
import type { ClienteML } from './ml/client';
import { entradaSchema, perfilSchema, tabelaSchema } from './schemas';
import type { Store } from './store';

export interface OpcoesApp {
  modoDemo: boolean;
  motivoModo: string;
  store: Store;
  ml?: ClienteML; // ausente = sem acesso à API
  provedorDemo?: ProvedorTarifa;
  dirWeb?: string;
}

class ErroHttp extends Error {
  constructor(public status: number, msg: string, public detalhes?: unknown) {
    super(msg);
  }
}

const wrap = (fn: (req: Request, res: Response) => Promise<unknown> | unknown) => (req: Request, res: Response, next: NextFunction) =>
  Promise.resolve(fn(req, res)).catch(next);

export function criarApp(o: OpcoesApp) {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  const perfis = (): PerfilCnpj[] => [...(o.modoDemo ? [perfilDemo] : []), ...o.store.ler().perfis];
  const tabelas = (): TabelaFrete[] => [...(o.modoDemo ? [tabelaDemo] : []), ...o.store.ler().tabelas];

  app.get('/api/status', (_req, res) => {
    res.json({
      modo: o.modoDemo ? 'demo' : 'producao',
      motivo: o.motivoModo,
      fonteTarifas: o.modoDemo ? (o.provedorDemo ?? provedorDemo).nome : o.ml?.provedor.nome,
      documentacao: 'https://developers.mercadolivre.com.br/pt_br/comissao-por-vender',
    });
  });

  // ---------------------------------------------------------------- categorias
  app.get('/api/categorias', wrap(async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 2) return res.json({ itens: [] });
    try {
      if (!o.ml) throw new Error('integração indisponível');
      res.json({ itens: await o.ml.buscarCategorias(q), fonte: 'API pública do Mercado Livre (domain_discovery)' });
    } catch (e) {
      if (o.modoDemo) {
        const itens = categoriasDemo.filter((c) => `${c.id} ${c.nome}`.toLowerCase().includes(q.toLowerCase()));
        return res.json({ itens, fonte: 'lista offline de demonstração', aviso: (e as Error).message });
      }
      throw new ErroHttp(502, `Busca de categorias indisponível: ${(e as Error).message}. Informe o ID da categoria (ex.: MLB1626).`);
    }
  }));
  app.get('/api/categorias/:id', wrap(async (req, res) => {
    if (!o.ml) throw new ErroHttp(502, 'integração indisponível');
    res.json(await o.ml.categoria(String(req.params.id)));
  }));

  // ---------------------------------------------------------------- perfis
  app.get('/api/perfis', (_req, res) => res.json(perfis()));
  app.put('/api/perfis/:id', (req, res) => {
    const p = perfilSchema.safeParse({ ...req.body, id: req.params.id });
    if (!p.success) throw new ErroHttp(400, 'Perfil inválido', p.error.flatten());
    if (p.data.demo || p.data.id === perfilDemo.id) throw new ErroHttp(403, 'O perfil de demonstração não pode ser alterado; crie um perfil seu');
    const d = o.store.ler();
    d.perfis = [...d.perfis.filter((x) => x.id !== p.data.id), p.data as PerfilCnpj];
    o.store.gravar(d);
    res.json(p.data);
  });
  app.delete('/api/perfis/:id', (req, res) => {
    const d = o.store.ler();
    d.perfis = d.perfis.filter((x) => x.id !== req.params.id);
    o.store.gravar(d);
    res.status(204).end();
  });

  // ---------------------------------------------------------------- tabelas de frete
  app.get('/api/tabelas-frete', (_req, res) => res.json(tabelas()));
  app.get('/api/tabelas-frete/modelo.csv', (_req, res) => {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="modelo-tabela-frete.csv"');
    res.send(`﻿${MODELO_CSV}\n`);
  });
  app.post('/api/tabelas-frete/previa-csv', (req, res) => {
    res.json(validarCSVFrete(String(req.body?.csv ?? '')));
  });
  app.put('/api/tabelas-frete/:id', (req, res) => {
    const t = tabelaSchema.safeParse({ ...req.body, id: req.params.id });
    if (!t.success) throw new ErroHttp(400, 'Tabela inválida', t.error.flatten());
    if (t.data.demo || t.data.id === tabelaDemo.id) throw new ErroHttp(403, 'Tabelas fictícias não podem ser gravadas');
    const d = o.store.ler();
    d.tabelas = [...d.tabelas.filter((x) => x.id !== t.data.id), t.data as TabelaFrete];
    o.store.gravar(d);
    res.json(t.data);
  });
  app.delete('/api/tabelas-frete/:id', (req, res) => {
    const d = o.store.ler();
    d.tabelas = d.tabelas.filter((x) => x.id !== req.params.id);
    o.store.gravar(d);
    res.status(204).end();
  });

  // ---------------------------------------------------------------- simulação
  app.post('/api/simular', wrap(async (req, res) => {
    const v = entradaSchema.safeParse(req.body);
    if (!v.success) throw new ErroHttp(400, 'Simulação com formato inválido', v.error.flatten());
    const entrada = v.data as unknown as EntradaSimulacao;
    const perfil = perfis().find((p) => p.id === entrada.perfilId);
    const tabela = entrada.frete.modo === 'tabela' ? tabelas().find((t) => t.id === entrada.frete.tabelaId) : undefined;
    const provedor: ProvedorTarifa | undefined = o.modoDemo ? (o.provedorDemo ?? provedorDemo) : o.ml?.provedor;
    const indisponivel: ProvedorTarifa = {
      nome: 'API Mercado Livre (não configurada)',
      demo: false,
      cotar: async () => {
        throw new Error('integração com o Mercado Livre não configurada no servidor');
      },
    };
    res.json(await simular(entrada, { perfil, tabela, provedor: provedor ?? indisponivel, modoDemo: o.modoDemo }));
  }));

  // ---------------------------------------------------------------- interface compilada
  if (o.dirWeb && fs.existsSync(o.dirWeb)) {
    app.use(express.static(o.dirWeb));
    app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(o.dirWeb!, 'index.html')));
  }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ErroHttp) return res.status(err.status).json({ erro: err.message, detalhes: err.detalhes });
    console.error(err);
    res.status(500).json({ erro: 'Erro interno', detalhe: (err as Error)?.message });
  });
  return app;
}
