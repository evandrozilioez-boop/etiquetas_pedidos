/**
 * Cliente da API oficial do Mercado Livre (somente leitura).
 * Nunca publica anúncios nem altera preços: só usa GET /sites/MLB/listing_prices,
 * endpoints públicos de categorias e, para renovar o token, POST /oauth/token.
 * Os tokens ficam apenas no servidor (variáveis de ambiente e data/tokens.json).
 */
import fs from 'node:fs';
import path from 'node:path';
import type { CotacaoTarifa, TipoAnuncio } from '../../engine';
import { LOGISTICAS } from '../../engine';
import type { ParamConsulta, ProvedorTarifa } from '../../engine/simulate';

const API = 'https://api.mercadolibre.com';
export type Fetch = typeof fetch;

export interface Credenciais {
  accessToken?: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
}

export function temCredenciais(c: Credenciais) {
  return !!(c.accessToken || (c.clientId && c.clientSecret && c.refreshToken));
}

async function getJSON(f: Fetch, url: string, headers: Record<string, string> = {}, timeoutMs = 10000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await f(url, { headers: { Accept: 'application/json', ...headers }, signal: ac.signal });
    const txt = await r.text();
    let body: unknown = null;
    try {
      body = txt ? JSON.parse(txt) : null;
    } catch {
      body = txt;
    }
    return { status: r.status, body };
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error(`tempo esgotado (${timeoutMs / 1000}s) ao consultar a API`);
    throw new Error(`falha de rede ao consultar a API: ${(e as Error).message}`);
  } finally {
    clearTimeout(t);
  }
}

class GerenciadorToken {
  private token?: string;
  private expira = 0;
  constructor(private cred: Credenciais, private arquivo: string, private f: Fetch) {
    this.token = cred.accessToken;
    try {
      const salvo = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
      if (salvo.refreshToken) this.cred.refreshToken = salvo.refreshToken;
      if (salvo.accessToken && salvo.expira > Date.now()) {
        this.token = salvo.accessToken;
        this.expira = salvo.expira;
      }
    } catch {
      /* sem arquivo salvo */
    }
    if (this.token && !this.expira) this.expira = Date.now() + 5 * 60 * 60 * 1000;
  }
  podeRenovar() {
    return !!(this.cred.clientId && this.cred.clientSecret && this.cred.refreshToken);
  }
  async obter(): Promise<string> {
    if (this.token && Date.now() < this.expira - 60_000) return this.token;
    if (this.podeRenovar()) return this.renovar();
    if (this.token) return this.token;
    throw new Error('sem credenciais do Mercado Livre configuradas no servidor');
  }
  async renovar(): Promise<string> {
    if (!this.podeRenovar()) throw new Error('token expirado e renovação automática não configurada (ML_CLIENT_ID, ML_CLIENT_SECRET, ML_REFRESH_TOKEN)');
    const r = await this.f(`${API}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.cred.clientId!,
        client_secret: this.cred.clientSecret!,
        refresh_token: this.cred.refreshToken!,
      }),
    });
    const body = (await r.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; message?: string };
    if (!r.ok || !body.access_token) throw new Error(`renovação do token falhou (HTTP ${r.status}${body.message ? `: ${body.message}` : ''})`);
    this.token = body.access_token;
    this.expira = Date.now() + (body.expires_in ?? 21600) * 1000;
    if (body.refresh_token) this.cred.refreshToken = body.refresh_token; // o refresh token é de uso único
    fs.mkdirSync(path.dirname(this.arquivo), { recursive: true });
    fs.writeFileSync(this.arquivo, JSON.stringify({ accessToken: this.token, expira: this.expira, refreshToken: this.cred.refreshToken }), { mode: 0o600 });
    return this.token;
  }
}

interface RespListingPrice {
  listing_type_id: string;
  sale_fee_amount: number;
  sale_fee_details?: { percentage_fee?: number; fixed_fee?: number; financing_add_on_fee?: number; gross_amount?: number };
  currency_id?: string;
}

/** Normaliza a resposta de listing_prices (objeto ou lista) para o tipo pedido. */
export function lerListingPrice(body: unknown, tipo: TipoAnuncio, preco: string): Omit<CotacaoTarifa, 'fonte' | 'consultadoEm'> {
  const lista = (Array.isArray(body) ? body.flat() : [body]) as RespListingPrice[];
  const item = lista.find((x) => x && x.listing_type_id === tipo);
  if (!item) throw new Error(`resposta da API sem o tipo de anúncio ${tipo}`);
  if (typeof item.sale_fee_amount !== 'number') throw new Error('resposta da API sem sale_fee_amount');
  if (item.currency_id && item.currency_id !== 'BRL') throw new Error(`moeda inesperada na resposta: ${item.currency_id}`);
  const det = item.sale_fee_details ?? {};
  return {
    tipoAnuncio: tipo,
    precoConsultado: preco,
    total: String(item.sale_fee_amount),
    percentual: String(det.percentage_fee ?? 0),
    fixa: String(det.fixed_fee ?? 0),
    financiamento: det.financing_add_on_fee !== undefined ? String(det.financing_add_on_fee) : undefined,
  };
}

export interface ClienteML {
  provedor: ProvedorTarifa;
  buscarCategorias(q: string): Promise<{ id: string; nome: string; caminho?: string }[]>;
  categoria(id: string): Promise<{ id: string; nome: string; caminho: string }>;
}

export function criarClienteML(opts: { cred: Credenciais; arquivoToken: string; cacheMinutos: number; fetch?: Fetch }): ClienteML {
  const f = opts.fetch ?? fetch;
  const tokens = new GerenciadorToken({ ...opts.cred }, opts.arquivoToken, f);
  const cache = new Map<string, CotacaoTarifa>();

  async function listingPrice(p: ParamConsulta & { preco: string }): Promise<CotacaoTarifa> {
    const chave = `${p.categoriaId}|${p.tipoAnuncio}|${p.logistica}|${p.quantidade}|${p.preco}`;
    const c = cache.get(chave);
    if (c && Date.now() - Date.parse(c.consultadoEm) < opts.cacheMinutos * 60_000) {
      return { ...c, cache: true, fonte: `${c.fonte} (reutilizada, consultada em ${new Date(c.consultadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })})` };
    }
    const qs = new URLSearchParams({
      price: p.preco,
      category_id: p.categoriaId,
      listing_type_id: p.tipoAnuncio,
      currency_id: 'BRL',
      logistic_type: p.logistica,
      shipping_mode: LOGISTICAS[p.logistica].shippingMode,
      quantity: String(p.quantidade),
    });
    const url = `${API}/sites/MLB/listing_prices?${qs}`;
    let token = await tokens.obter();
    let r = await getJSON(f, url, { Authorization: `Bearer ${token}` });
    if (r.status === 401 && tokens.podeRenovar()) {
      token = await tokens.renovar();
      r = await getJSON(f, url, { Authorization: `Bearer ${token}` });
    }
    if (r.status !== 200) {
      const msg = (r.body as { message?: string })?.message;
      throw new Error(`API listing_prices respondeu HTTP ${r.status}${msg ? `: ${msg}` : ''}`);
    }
    const cot: CotacaoTarifa = {
      ...lerListingPrice(r.body, p.tipoAnuncio, p.preco),
      fonte: 'API Mercado Livre — /sites/MLB/listing_prices',
      consultadoEm: new Date().toISOString(),
    };
    cache.set(chave, cot);
    return cot;
  }

  return {
    provedor: { nome: 'API Mercado Livre — /sites/MLB/listing_prices', demo: false, cotar: listingPrice },
    async buscarCategorias(q) {
      const r = await getJSON(f, `${API}/sites/MLB/domain_discovery/search?${new URLSearchParams({ q, limit: '8' })}`);
      if (r.status !== 200) throw new Error(`busca de categorias respondeu HTTP ${r.status}`);
      const seen = new Set<string>();
      return (r.body as { category_id: string; category_name: string; domain_name?: string }[])
        .filter((x) => !seen.has(x.category_id) && seen.add(x.category_id))
        .map((x) => ({ id: x.category_id, nome: x.category_name, caminho: x.domain_name }));
    },
    async categoria(id) {
      const r = await getJSON(f, `${API}/categories/${encodeURIComponent(id)}`);
      if (r.status !== 200) throw new Error(`categoria ${id} não encontrada (HTTP ${r.status})`);
      const b = r.body as { id: string; name: string; path_from_root?: { name: string }[] };
      return { id: b.id, nome: b.name, caminho: (b.path_from_root ?? []).map((p) => p.name).join(' › ') };
    },
  };
}
