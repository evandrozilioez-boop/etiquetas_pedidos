import { Alert, AlertTitle, AppBar, Box, Container, Link, Tab, Tabs, Toolbar, Typography } from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import type { PerfilCnpj, Produto, TabelaFrete } from '../engine/types';
import { api, type Status } from './api';
import Perfis from './components/Perfis';
import Produtos from './components/Produtos';
import Simulacao from './components/Simulacao';
import Tabelas from './components/Tabelas';

export default function App() {
  const [aba, setAba] = useState(0);
  const [status, setStatus] = useState<Status | null>(null);
  const [perfis, setPerfis] = useState<PerfilCnpj[]>([]);
  const [tabelas, setTabelas] = useState<TabelaFrete[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [carregar, setCarregar] = useState<{ p: Produto; n: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const recarregar = useCallback(async () => {
    try {
      const [s, p, t, pr] = await Promise.all([api.status(), api.perfis(), api.tabelas(), api.produtos()]);
      setProdutos(pr);
      setStatus(s);
      setPerfis(p);
      setTabelas(t);
      setErro(null);
    } catch (e) {
      setErro(`Servidor indisponível: ${(e as Error).message}`);
    }
  }, []);
  useEffect(() => {
    recarregar();
  }, [recarregar]);

  const demo = status?.modo === 'demo';
  return (
    <Box sx={{ minHeight: '100vh' }}>
      <AppBar position="static" elevation={0} color={demo ? 'warning' : 'primary'}>
        <Toolbar sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>Precificação · Mercado Livre Brasil</Typography>
          {status && <Typography variant="body2">{demo ? 'MODO DEMONSTRAÇÃO' : 'Integração oficial ativa'}</Typography>}
        </Toolbar>
        <Tabs value={aba} onChange={(_, v) => setAba(v)} textColor="inherit" indicatorColor="secondary" variant="scrollable" allowScrollButtonsMobile>
          <Tab label="Simulação" />
          <Tab label={`Meus produtos${produtos.length ? ` (${produtos.length})` : ''}`} />
          <Tab label="Perfis CNPJ" />
          <Tab label="Tabelas de frete" />
          <Tab label="Integração" />
        </Tabs>
      </AppBar>
      <Container maxWidth="xl" sx={{ py: 2, px: { xs: 2, sm: 3 } }}>
        {erro && <Alert severity="error" sx={{ mb: 2 }}>{erro}</Alert>}
        {demo && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            <AlertTitle>Modo de demonstração</AlertTitle>
            Tarifas, tabela de frete e perfil fiscal marcados como fictícios. Motivo: {status?.motivo}. Veja a aba “Integração” para usar suas credenciais.
          </Alert>
        )}
        <Box hidden={aba !== 0}><Simulacao perfis={perfis} tabelas={tabelas} modoDemo={demo} produtoCarregado={carregar} onProdutoSalvo={recarregar} /></Box>
        {aba === 1 && <Produtos produtos={produtos} recarregar={recarregar} simular={(p) => { setCarregar((c) => ({ p, n: (c?.n ?? 0) + 1 })); setAba(0); }} />}
        {aba === 2 && <Perfis perfis={perfis} recarregar={recarregar} />}
        {aba === 3 && <Tabelas tabelas={tabelas} recarregar={recarregar} />}
        {aba === 4 && status && (
          <Box sx={{ maxWidth: 800 }}>
            <Typography variant="h6">Integração com o Mercado Livre</Typography>
            <Typography variant="body2" sx={{ my: 1 }}>Modo atual: <b>{demo ? 'demonstração' : 'produção'}</b> — {status.motivo}.</Typography>
            <Typography variant="body2">Fonte de tarifas: {status.fonteTarifas}</Typography>
            <Typography variant="body2" sx={{ mt: 2 }}>
              O app só lê dados: consulta <code>GET /sites/MLB/listing_prices</code> e as categorias públicas. Não publica anúncios nem altera preços. Os tokens ficam no servidor (arquivo <code>.env</code> e <code>data/tokens.json</code>) e nunca são enviados ao navegador.
            </Typography>
            <Typography variant="body2" sx={{ mt: 2 }}>
              Para usar suas credenciais, copie <code>.env.example</code> para <code>.env</code>, preencha <code>ML_CLIENT_ID</code>, <code>ML_CLIENT_SECRET</code> e <code>ML_REFRESH_TOKEN</code> (ou <code>ML_ACCESS_TOKEN</code>), defina <code>ML_MODE=producao</code> e reinicie o servidor. Documentação: <Link href={status.documentacao} target="_blank" rel="noreferrer">custos por vender</Link>.
            </Typography>
          </Box>
        )}
      </Container>
    </Box>
  );
}
