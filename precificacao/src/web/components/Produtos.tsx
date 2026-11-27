import AddIcon from '@mui/icons-material/Add';
import SearchIcon from '@mui/icons-material/Search';
import {
  Alert, Box, Button, Card, CardActions, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Grid, InputAdornment, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { useMemo, useState } from 'react';
import type { Produto } from '../../engine/types';
import { NOME_TIPO_ANUNCIO } from '../../engine/types';
import { api, confirmar } from '../api';
import { formInicial, montarProduto } from '../estado';
import { brl, dataBR, dataHoraBR, deBR, paraBR, parseNumeroBR } from '../format';
import { NumField } from './campos';

const custoBR = (p: Produto) => p.simulacao.custos.compraUnitaria;

export default function Produtos({ produtos, recarregar, simular }: { produtos: Produto[]; recarregar: () => void; simular: (p: Produto) => void }) {
  const [busca, setBusca] = useState('');
  const [novo, setNovo] = useState<{ nome: string; sku: string; categoria: string; compra: string; freteEntrada: string; freteIncluso: boolean; embalagem: string; embalagemInclusa: boolean; unidades: number } | null>(null);
  const [custo, setCusto] = useState<{ p: Produto; valor: string } | null>(null);
  const [hist, setHist] = useState<Produto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const cheia = useMediaQuery(useTheme().breakpoints.down('sm'));

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return produtos.filter((p) => !q || `${p.nome} ${p.sku ?? ''} ${p.simulacao.categoria?.id ?? ''} ${p.simulacao.categoria?.nome ?? ''}`.toLowerCase().includes(q));
  }, [produtos, busca]);

  async function salvarNovo() {
    if (!novo) return;
    if (!novo.nome.trim()) return setErro('Informe o nome do produto');
    if (parseNumeroBR(novo.compra) === null) return setErro('Informe o custo de compra (ex.: 600 ou 1.234,56)');
    const f = formInicial();
    const cat = novo.categoria.trim().toUpperCase();
    const form = {
      ...f,
      descricao: novo.nome,
      categoria: /^MLB\d+$/.test(cat) ? { id: cat } : null,
      unidadesPorVenda: novo.unidades,
      custos: { compraUnitaria: novo.compra, freteEntradaUnitario: novo.freteEntrada, freteEntradaIncluso: novo.freteIncluso, embalagemPorVenda: novo.embalagem, embalagemInclusa: novo.embalagemInclusa },
    };
    try {
      await api.salvarProduto(montarProduto(null, { nome: novo.nome, sku: novo.sku }, form, undefined));
      setNovo(null);
      setErro(null);
      recarregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function salvarCusto() {
    if (!custo) return;
    if (parseNumeroBR(custo.valor) === null) return setErro('Custo inválido (ex.: 600 ou 1.234,56)');
    const p = custo.p;
    const form = { ...p.simulacao, custos: { ...p.simulacao.custos, compraUnitaria: custo.valor } };
    await api.salvarProduto(montarProduto(p, { nome: p.nome, sku: p.sku }, form, undefined));
    setCusto(null);
    setErro(null);
    recarregar();
  }

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} justifyContent="space-between" sx={{ mb: 2 }}>
        <TextField
          placeholder="Buscar por nome, SKU ou categoria"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          sx={{ maxWidth: { sm: 420 } }}
          InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }}
        />
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setErro(null); setNovo({ nome: '', sku: '', categoria: '', compra: '', freteEntrada: '0', freteIncluso: false, embalagem: '0', embalagemInclusa: false, unidades: 1 }); }}>
          Cadastrar produto
        </Button>
      </Stack>
      {!produtos.length && (
        <Alert severity="info">
          Nenhum produto salvo. Cadastre aqui com o custo de compra, ou faça uma simulação e clique em “Salvar produto”. O item fica salvo com custos, caixas, categoria e o último preço calculado.
        </Alert>
      )}
      <Grid container spacing={2}>
        {lista.map((p) => {
          const s = p.simulacao;
          const ult = p.ultimoResultado;
          const custoAtual = deBR(custoBR(p));
          const ultDesatualizado = !!ult && ult.custoCompra !== custoAtual;
          return (
            <Grid item xs={12} md={6} xl={4} key={p.id}>
              <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Stack direction="row" justifyContent="space-between" spacing={1}>
                    <Typography variant="h6" sx={{ lineHeight: 1.3 }}>{p.nome}</Typography>
                    {p.sku && <Chip size="small" label={p.sku} />}
                  </Stack>
                  <Typography variant="body2" color="text.secondary">
                    {s.categoria ? `${s.categoria.nome ? `${s.categoria.nome} · ` : ''}${s.categoria.id}` : 'sem categoria'} · {s.unidadesPorVenda} un. por venda · {s.caixas.reduce((t, c) => t + c.quantidade, 0)} caixa(s)
                  </Typography>
                  <Table size="small" sx={{ mt: 1 }}>
                    <TableBody>
                      <TableRow><TableCell sx={{ pl: 0 }}>Custo de compra (unidade)</TableCell><TableCell align="right"><b>{custoAtual && !custoAtual.startsWith('inválido') ? brl(custoAtual) : '—'}</b></TableCell></TableRow>
                      <TableRow><TableCell sx={{ pl: 0 }}>Frete de entrada</TableCell><TableCell align="right">{s.custos.freteEntradaIncluso ? 'incluso na compra' : brl(deBR(s.custos.freteEntradaUnitario))}</TableCell></TableRow>
                      <TableRow><TableCell sx={{ pl: 0 }}>Embalagem</TableCell><TableCell align="right">{s.custos.embalagemInclusa ? 'inclusa na compra' : brl(deBR(s.custos.embalagemPorVenda))}</TableCell></TableRow>
                    </TableBody>
                  </Table>
                  {ult ? (
                    <Box sx={{ mt: 1 }}>
                      <Typography variant="caption" color="text.secondary">
                        Último cálculo em {dataHoraBR(ult.calculadoEm)} · margem {paraBR(ult.margemAlvoPct)}%{ult.demo ? ' · DEMONSTRAÇÃO' : ''}
                      </Typography>
                      <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
                        {ult.precos.map((x, i) => (
                          <Typography key={i} variant="body2">{NOME_TIPO_ANUNCIO[x.tipoAnuncio]}{ult.precos.length > 2 ? ` / ${x.regime === 'simples' ? 'Simples' : 'L. Real'}` : ''}: <b>{x.preco ? brl(x.preco) : '—'}</b></Typography>
                        ))}
                      </Stack>
                      {ultDesatualizado && <Typography variant="caption" color="warning.main">Custo alterado depois do último cálculo — simule de novo.</Typography>}
                    </Box>
                  ) : (
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 1 }}>Ainda sem preço calculado.</Typography>
                  )}
                  <Typography variant="caption" color="text.secondary" display="block">Atualizado em {dataHoraBR(p.atualizadoEm)}</Typography>
                </CardContent>
                <CardActions sx={{ flexWrap: 'wrap' }}>
                  <Button variant="contained" size="small" onClick={() => simular(p)}>Simular preço</Button>
                  <Button size="small" onClick={() => { setErro(null); setCusto({ p, valor: custoBR(p) }); }}>Atualizar custo</Button>
                  <Button size="small" onClick={() => setHist(p)}>Histórico</Button>
                  <Button size="small" color="error" onClick={async () => { if (confirmar(`Excluir ${p.nome}?`)) { await api.excluirProduto(p.id); recarregar(); } }}>Excluir</Button>
                </CardActions>
              </Card>
            </Grid>
          );
        })}
      </Grid>

      <Dialog open={!!novo} onClose={() => setNovo(null)} fullScreen={cheia} maxWidth="sm" fullWidth>
        <DialogTitle>Cadastrar produto</DialogTitle>
        <DialogContent dividers>
          {novo && (
            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={8}><TextField autoFocus label="Nome do produto" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} /></Grid>
              <Grid item xs={12} sm={4}><TextField label="SKU / código (opcional)" value={novo.sku} onChange={(e) => setNovo({ ...novo, sku: e.target.value })} /></Grid>
              <Grid item xs={12} sm={8}><TextField label="Categoria ML (ID, opcional)" placeholder="MLB1626" value={novo.categoria} onChange={(e) => setNovo({ ...novo, categoria: e.target.value })} /></Grid>
              <Grid item xs={12} sm={4}><TextField label="Unidades por venda" type="number" inputProps={{ min: 1 }} value={novo.unidades} onChange={(e) => setNovo({ ...novo, unidades: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} /></Grid>
              <Grid item xs={12}><NumField label="Custo unitário de compra" prefixo="R$" obrigatorio value={novo.compra} onChange={(v) => setNovo({ ...novo, compra: v })} /></Grid>
              <Grid item xs={12} sm={6}>
                <NumField label="Frete de entrada por unidade" prefixo="R$" disabled={novo.freteIncluso} value={novo.freteIncluso ? '' : novo.freteEntrada} onChange={(v) => setNovo({ ...novo, freteEntrada: v })} />
                <FormControlLabel control={<Switch size="small" checked={novo.freteIncluso} onChange={(e) => setNovo({ ...novo, freteIncluso: e.target.checked })} />} label={<Typography variant="body2">Incluso na compra</Typography>} />
              </Grid>
              <Grid item xs={12} sm={6}>
                <NumField label="Embalagem por venda" prefixo="R$" disabled={novo.embalagemInclusa} value={novo.embalagemInclusa ? '' : novo.embalagem} onChange={(v) => setNovo({ ...novo, embalagem: v })} />
                <FormControlLabel control={<Switch size="small" checked={novo.embalagemInclusa} onChange={(e) => setNovo({ ...novo, embalagemInclusa: e.target.checked })} />} label={<Typography variant="body2">Inclusa na compra</Typography>} />
              </Grid>
              <Grid item xs={12}><Typography variant="caption" color="text.secondary">Caixas, frete, margem e demais despesas você completa na simulação e salva de novo.</Typography></Grid>
            </Grid>
          )}
          {erro && <Alert severity="error" sx={{ mt: 2 }}>{erro}</Alert>}
        </DialogContent>
        <DialogActions><Button onClick={() => setNovo(null)}>Cancelar</Button><Button variant="contained" onClick={salvarNovo}>Salvar produto</Button></DialogActions>
      </Dialog>

      <Dialog open={!!custo} onClose={() => setCusto(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Atualizar custo — {custo?.p.nome}</DialogTitle>
        <DialogContent dividers>
          {custo && <NumField autoFocus label="Novo custo unitário de compra" prefixo="R$" value={custo.valor} onChange={(v) => setCusto({ ...custo, valor: v })} helperText="O custo anterior fica no histórico." />}
          {erro && <Alert severity="error" sx={{ mt: 2 }}>{erro}</Alert>}
        </DialogContent>
        <DialogActions><Button onClick={() => setCusto(null)}>Cancelar</Button><Button variant="contained" onClick={salvarCusto}>Salvar custo</Button></DialogActions>
      </Dialog>

      <Dialog open={!!hist} onClose={() => setHist(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Histórico de custo — {hist?.nome}</DialogTitle>
        <DialogContent dividers>
          <Table size="small">
            <TableHead><TableRow><TableCell>Data</TableCell><TableCell align="right">Custo de compra</TableCell></TableRow></TableHead>
            <TableBody>
              {[...(hist?.historicoCusto ?? [])].reverse().map((h, i) => (
                <TableRow key={i}><TableCell>{dataBR(h.data)}</TableCell><TableCell align="right">{brl(h.custoCompra)}</TableCell></TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
        <DialogActions><Button onClick={() => setHist(null)}>Fechar</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
