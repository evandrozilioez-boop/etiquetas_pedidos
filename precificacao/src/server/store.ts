import fs from 'node:fs';
import path from 'node:path';
import type { PerfilCnpj, TabelaFrete } from '../engine';

/** Persistência leve: um arquivo JSON com as configurações reutilizáveis. */
export interface Dados {
  perfis: PerfilCnpj[];
  tabelas: TabelaFrete[];
}

export interface Store {
  ler(): Dados;
  gravar(d: Dados): void;
}

export function storeArquivo(arquivo: string): Store {
  return {
    ler() {
      try {
        const txt = fs.readFileSync(arquivo, 'utf8');
        const d = JSON.parse(txt) as Partial<Dados>;
        return { perfis: d.perfis ?? [], tabelas: d.tabelas ?? [] };
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { perfis: [], tabelas: [] };
        throw e;
      }
    },
    gravar(d) {
      fs.mkdirSync(path.dirname(arquivo), { recursive: true });
      const tmp = `${arquivo}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(d, null, 2));
      fs.renameSync(tmp, arquivo);
    },
  };
}

export function storeMemoria(inicial: Dados = { perfis: [], tabelas: [] }): Store {
  let d = structuredClone(inicial);
  return {
    ler: () => structuredClone(d),
    gravar: (n) => {
      d = structuredClone(n);
    },
  };
}
