import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { criarApp } from './app';
import { criarClienteML, temCredenciais } from './ml/client';
import { storeArquivo } from './store';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// carrega .env simples (sem dependência extra)
const envFile = path.join(raiz, '.env');
if (fs.existsSync(envFile)) {
  for (const linha of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const cred = {
  accessToken: process.env.ML_ACCESS_TOKEN || undefined,
  clientId: process.env.ML_CLIENT_ID || undefined,
  clientSecret: process.env.ML_CLIENT_SECRET || undefined,
  refreshToken: process.env.ML_REFRESH_TOKEN || undefined,
};
const pediuDemo = (process.env.ML_MODE ?? '').toLowerCase() === 'demo';
const credOk = temCredenciais(cred);
const modoDemo = pediuDemo || !credOk;
const motivoModo = pediuDemo
  ? 'ML_MODE=demo definido no servidor'
  : credOk
    ? 'credenciais do Mercado Livre configuradas no servidor'
    : 'sem credenciais do Mercado Livre no servidor (defina ML_ACCESS_TOKEN ou ML_CLIENT_ID/ML_CLIENT_SECRET/ML_REFRESH_TOKEN)';

const ml = criarClienteML({
  cred,
  arquivoToken: path.join(raiz, 'data', 'tokens.json'),
  cacheMinutos: Number(process.env.ML_CACHE_MINUTOS ?? 30),
});

const app = criarApp({
  modoDemo,
  motivoModo,
  store: storeArquivo(path.join(raiz, 'data', 'config.json')),
  ml,
  dirWeb: path.join(raiz, 'dist', 'web'),
});

const porta = Number(process.env.PORT ?? 3340);
app.listen(porta, () => {
  console.log(`Precificação Mercado Livre em http://localhost:${porta}`);
  console.log(modoDemo ? `MODO DEMONSTRAÇÃO — ${motivoModo}` : `Modo produção — ${motivoModo}`);
});
