import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { criarApp } from '../src/server/app';
import { criarClienteML, lerListingPrice } from '../src/server/ml/client';
import { storeMemoria } from '../src/server/store';
import { entradaBase, perfilZero, tabelaFrete } from './fixtures';

const tmpToken = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mlt-')), 'tokens.json');

/** Resposta no formato documentado de /sites/MLB/listing_prices (valores fictícios). */
function respostaListing(preco: number, tipo: string) {
  const pct = tipo === 'gold_pro' ? 17 : 12;
  const fixa = preco < 79 ? 6.25 : 0;
  const total = Math.round(preco * pct) / 100 + fixa;
  return [{
    currency_id: 'BRL', listing_type_id: tipo, listing_type_name: tipo === 'gold_pro' ? 'Premium' : 'Clássico',
    listing_fee_amount: 0, sale_fee_amount: total,
    sale_fee_details: { financing_add_on_fee: tipo === 'gold_pro' ? 5 : 0, fixed_fee: fixa, gross_amount: total, meli_percentage_fee: 0, percentage_fee: pct },
  }];
}

function fetchFalso(opts: { falhar?: number; expirarPrimeiro?: boolean } = {}) {
  const chamadas: string[] = [];
  let expirou = false;
  const f = (async (url: string | URL, init?: RequestInit) => {
    const u = new URL(String(url));
    chamadas.push(`${init?.method ?? 'GET'} ${u.pathname}${u.search}`);
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
    if (u.pathname === '/oauth/token') return json(200, { access_token: 'novo-token', refresh_token: 'novo-refresh', expires_in: 21600 });
    if (u.pathname === '/sites/MLB/listing_prices') {
      if (opts.falhar) return json(opts.falhar, { message: 'service unavailable' });
      const auth = (init?.headers as Record<string, string>).Authorization;
      if (opts.expirarPrimeiro && !expirou) {
        expirou = true;
        return json(401, { message: 'invalid access token' });
      }
      expect(auth).toMatch(/^Bearer /);
      return json(200, respostaListing(Number(u.searchParams.get('price')), u.searchParams.get('listing_type_id')!));
    }
    if (u.pathname.includes('domain_discovery')) return json(200, [{ category_id: 'MLB1626', category_name: 'Sofás', domain_name: 'Sofás, futons e poltronas' }]);
    return json(404, {});
  }) as typeof fetch;
  return { f, chamadas };
}

describe('leitura de listing_prices', () => {
  it('usa sale_fee_amount como total e não soma fixed_fee de novo', () => {
    const c = lerListingPrice(respostaListing(50, 'gold_special'), 'gold_special', '50.00');
    expect(c.total).toBe('12.25'); // 12% de 50 = 6,00 + 6,25 fixa já incluída
    expect(c.fixa).toBe('6.25');
  });
  it('falha explícita se faltar o total', () => {
    expect(() => lerListingPrice([{ listing_type_id: 'gold_pro' }], 'gold_pro', '1')).toThrow(/sale_fee_amount/);
  });
});

describe('API em modo produção (Mercado Livre simulado)', () => {
  const perfil = perfilZero();
  const store = () => storeMemoria({ perfis: [perfil], tabelas: [] });

  it('consulta tarifas no servidor, com token, e confirma no preço final', async () => {
    const { f, chamadas } = fetchFalso();
    const ml = criarClienteML({ cred: { accessToken: 'tok' }, arquivoToken: tmpToken(), cacheMinutos: 30, fetch: f });
    const app = criarApp({ modoDemo: false, motivoModo: 'teste', store: store(), ml });
    const r = await request(app).post('/api/simular').send(entradaBase({ margemAlvoPct: '25' }));
    expect(r.status).toBe(200);
    const [classico, premium] = r.body.cenarios;
    expect(classico.status).toBe('validado');
    // 0,75P − 0,12P = 600 → P = 952,38
    expect(classico.avaliacao.preco).toBe('952.39');
    expect(classico.tarifaInfo.consultado.precoConsultado).toBe('952.39');
    expect(premium.avaliacao.preco).toBe('1034.48'); // tarifa 17% = 175,86; resultado 258,62 = 25% × 1034,48
    const q = chamadas.find((c) => c.includes('listing_prices'))!;
    for (const p of ['category_id=MLB-TESTE', 'listing_type_id=', 'currency_id=BRL', 'logistic_type=drop_off', 'shipping_mode=me2', 'quantity=1']) expect(q).toContain(p);
  });

  it('renova o token no servidor quando a API responde 401', async () => {
    const { f, chamadas } = fetchFalso({ expirarPrimeiro: true });
    const ml = criarClienteML({ cred: { accessToken: 'velho', clientId: 'id', clientSecret: 's', refreshToken: 'r' }, arquivoToken: tmpToken(), cacheMinutos: 30, fetch: f });
    const app = criarApp({ modoDemo: false, motivoModo: 'teste', store: store(), ml });
    const r = await request(app).post('/api/simular').send(entradaBase());
    expect(r.body.cenarios[0].status).toBe('validado');
    expect(chamadas.some((c) => c.startsWith('POST /oauth/token'))).toBe(true);
    expect(JSON.stringify(r.body)).not.toContain('novo-token');
  });

  it('API indisponível: cenário pendente com orientação de entrada manual', async () => {
    const { f } = fetchFalso({ falhar: 503 });
    const ml = criarClienteML({ cred: { accessToken: 'tok' }, arquivoToken: tmpToken(), cacheMinutos: 30, fetch: f });
    const app = criarApp({ modoDemo: false, motivoModo: 'teste', store: store(), ml });
    const r = await request(app).post('/api/simular').send(entradaBase());
    expect(r.body.cenarios[0].status).toBe('pendente');
    expect(r.body.cenarios[0].mensagem).toContain('HTTP 503');
    expect(r.body.cenarios[0].avaliacao).toBeUndefined();
  });

  it('dados fictícios não aparecem fora do modo demonstração', async () => {
    const app = criarApp({ modoDemo: false, motivoModo: 'teste', store: store() });
    const perfis = await request(app).get('/api/perfis');
    expect(perfis.body.some((p: { demo?: boolean }) => p.demo)).toBe(false);
    const tabs = await request(app).get('/api/tabelas-frete');
    expect(tabs.body).toEqual([]);
  });
});

describe('modo demonstração e configurações', () => {
  it('identifica o modo e calcula com dados fictícios', async () => {
    const app = criarApp({ modoDemo: true, motivoModo: 'sem credenciais', store: storeMemoria() });
    const s = await request(app).get('/api/status');
    expect(s.body.modo).toBe('demo');
    const e = entradaBase({ perfilId: 'demo-perfil', frete: { modo: 'tabela', tabelaId: 'demo-tabela' }, tributacao: { modo: 'comparar' }, margemAlvoPct: '20' });
    const r = await request(app).post('/api/simular').send(e);
    expect(r.body.modoDemo).toBe(true);
    expect(r.body.cenarios).toHaveLength(4);
    expect(r.body.cenarios[0].status).toBe('minimo_comprovado');
    expect(r.body.cenarios[0].tarifaInfo.fonte).toContain('DEMONSTRAÇÃO');
    // perfil demo tem provisão pendente no Lucro Real
    expect(r.body.cenarios[2].margemFinalPendente).toBe(true);
  });

  it('prévia do CSV aponta erros antes de importar; tabela válida é gravada', async () => {
    const store = storeMemoria();
    const app = criarApp({ modoDemo: true, motivoModo: 't', store });
    const modelo = await request(app).get('/api/tabelas-frete/modelo.csv');
    expect(modelo.text).toContain('preco_min;preco_max;peso_min_kg;peso_max_kg;regiao;custo');
    const ok = await request(app).post('/api/tabelas-frete/previa-csv').send({ csv: modelo.text });
    expect(ok.body.erros).toEqual([]);
    expect(ok.body.linhas).toHaveLength(5);
    const ruim = await request(app).post('/api/tabelas-frete/previa-csv').send({ csv: 'preco_min;preco_max;peso_min_kg;peso_max_kg;regiao;custo\n0;100;0;1;;abc\n0;100;0;1;;10\n0;50;0,5;2;;12' });
    expect(ruim.body.erros.map((e: { mensagem: string }) => e.mensagem).join()).toMatch(/inválido.*sobreposta/s);
    const t = tabelaFrete({ id: 'x' });
    const put = await request(app).put('/api/tabelas-frete/minha').send({ ...t, linhas: ok.body.linhas });
    expect(put.status).toBe(200);
    expect(store.ler().tabelas[0].id).toBe('minha');
    const demo = await request(app).put('/api/tabelas-frete/y').send({ ...t, demo: true });
    expect(demo.status).toBe(403);
  });

  it('perfil sem dado obrigatório é recusado', async () => {
    const app = criarApp({ modoDemo: true, motivoModo: 't', store: storeMemoria() });
    const r = await request(app).put('/api/perfis/p1').send({ ...perfilZero(), razaoSocial: '' });
    expect(r.status).toBe(400);
  });
});
