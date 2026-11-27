import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import CalculateIcon from '@mui/icons-material/Calculate';
import {
  Alert, Autocomplete, Box, Button, Chip, CircularProgress, Collapse, FormControlLabel, Grid, IconButton, MenuItem, Stack, Switch, TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ResultadoSimulacao } from '../../engine/simulate';
import type { AjusteTarifa, BasePreco, Logistica, PerfilCnpj, TabelaFrete, TipoAnuncio } from '../../engine/types';
import { LOGISTICAS, NOME_BASE, NOME_TIPO_ANUNCIO } from '../../engine/types';
import { api, ESTATICO, type Categoria } from '../api';
import { formExemplo, formInicial, gravarRascunho, lerRascunho, paraEntrada, type FormSim } from '../estado';
import { dataBR } from '../format';
import { NumField, Secao, Selecao } from './campos';
import Resultados from './Resultados';

const BASES: [BasePreco, string][] = Object.entries(NOME_BASE) as [BasePreco, string][];

export default function Simulacao({ perfis, tabelas, modoDemo }: { perfis: PerfilCnpj[]; tabelas: TabelaFrete[]; modoDemo: boolean }) {
  const [f, setF] = useState<FormSim>(() => lerRascunho() ?? (ESTATICO ? formExemplo() : formInicial()));
  const [res, setRes] = useState<ResultadoSimulacao | null>(null);
  const [assinatura, setAssinatura] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const reqId = useRef(0);
  const painel = useRef<HTMLDivElement>(null);

  const assinaturaAtual = useMemo(() => JSON.stringify(f), [f]);
  useEffect(() => gravarRascunho(f), [f]);
  // perfil e tabela padrão
  useEffect(() => {
    if (!f.perfilId && perfis.length) setF((x) => ({ ...x, perfilId: perfis[0].id }));
  }, [perfis, f.perfilId]);

  const set = (patch: Partial<FormSim>) => setF((x) => ({ ...x, ...patch }));
  const perfil = perfis.find((p) => p.id === f.perfilId);
  const tabelasAplicaveis = tabelas.filter((t) => t.logisticas.includes(f.logistica));
  const tabelaSel = tabelas.find((t) => t.id === f.frete.tabelaId);
  const desatualizado = res !== null && assinatura !== assinaturaAtual;

  async function calcular() {
    const id = ++reqId.current;
    setCarregando(true);
    setErro(null);
    setRes(null); // invalida o resultado anterior até concluir o recálculo
    const sig = assinaturaAtual;
    try {
      const r = await api.simular(paraEntrada(f));
      if (id !== reqId.current) return;
      setRes(r);
      setAssinatura(sig);
      if (window.innerWidth < 1200) setTimeout(() => painel.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (e) {
      if (id === reqId.current) setErro((e as Error).message);
    } finally {
      if (id === reqId.current) setCarregando(false);
    }
  }

  return (
    <Grid container spacing={2}>
      <Grid item xs={12} lg={7}>
        <Secao titulo="Produto">
          <Grid container spacing={1.5}>
            <Grid item xs={12} md={6}>
              <TextField label="Descrição (opcional)" value={f.descricao ?? ''} onChange={(e) => set({ descricao: e.target.value })} />
            </Grid>
            <Grid item xs={12} md={6}>
              <BuscaCategoria valor={f.categoria ?? null} onChange={(c) => set({ categoria: c })} />
            </Grid>
            <Grid item xs={12} sm={6} md={4}>
              <TextField
                label="Unidades vendidas no anúncio"
                type="number"
                inputProps={{ min: 1, step: 1 }}
                value={f.unidadesPorVenda}
                onChange={(e) => set({ unidadesPorVenda: Math.max(1, Math.floor(Number(e.target.value) || 1)) })}
                helperText="Unidades do produto comprado em cada venda (kit)"
              />
            </Grid>
          </Grid>
        </Secao>

        <Secao titulo="Custo de aquisição" subtitulo="Campos vazios ficam pendentes — informe 0 quando não houver o gasto.">
          <Grid container spacing={1.5}>
            <Grid item xs={12} sm={4}>
              <NumField label="Custo unitário de compra" prefixo="R$" obrigatorio value={f.custos.compraUnitaria} onChange={(v) => set({ custos: { ...f.custos, compraUnitaria: v } })} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <NumField label="Frete de entrada por unidade" prefixo="R$" disabled={f.custos.freteEntradaIncluso} obrigatorio={!f.custos.freteEntradaIncluso} value={f.custos.freteEntradaIncluso ? '' : f.custos.freteEntradaUnitario} onChange={(v) => set({ custos: { ...f.custos, freteEntradaUnitario: v } })} />
              <FormControlLabel control={<Switch size="small" checked={f.custos.freteEntradaIncluso} onChange={(e) => set({ custos: { ...f.custos, freteEntradaIncluso: e.target.checked } })} />} label={<Typography variant="body2">Já incluído no custo de compra</Typography>} />
            </Grid>
            <Grid item xs={12} sm={4}>
              <NumField label="Embalagem por venda" prefixo="R$" disabled={f.custos.embalagemInclusa} obrigatorio={!f.custos.embalagemInclusa} value={f.custos.embalagemInclusa ? '' : f.custos.embalagemPorVenda} onChange={(v) => set({ custos: { ...f.custos, embalagemPorVenda: v } })} />
              <FormControlLabel control={<Switch size="small" checked={f.custos.embalagemInclusa} onChange={(e) => set({ custos: { ...f.custos, embalagemInclusa: e.target.checked } })} />} label={<Typography variant="body2">Já incluída no custo de compra</Typography>} />
            </Grid>
          </Grid>
        </Secao>

        <Secao titulo="Meta e operação">
          <Grid container spacing={1.5}>
            <Grid item xs={12} sm={4}>
              <NumField label="Margem desejada sobre a receita" sufixo="%" obrigatorio value={f.margemAlvoPct} onChange={(v) => set({ margemAlvoPct: v })} />
            </Grid>
            <Grid item xs={12} sm={8}>
              <TextField select label="CNPJ vendedor" value={f.perfilId ?? ''} onChange={(e) => set({ perfilId: e.target.value })} helperText={perfis.length ? undefined : 'Cadastre um perfil na aba "Perfis CNPJ"'}>
                {perfis.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.razaoSocial} — {p.cnpj} {p.demo && <Chip size="small" color="warning" label="fictício" sx={{ ml: 1 }} />}
                  </MenuItem>
                ))}
              </TextField>
            </Grid>
            <Grid item xs={12} sm={4}>
              <TextField label="Data de referência" type="date" value={f.dataReferencia} onChange={(e) => set({ dataReferencia: e.target.value })} InputLabelProps={{ shrink: true }} />
            </Grid>
            <Grid item xs={12} sm={8}>
              <Selecao<Logistica> label="Modalidade logística" value={f.logistica} onChange={(v) => set({ logistica: v, frete: { ...f.frete, tabelaId: undefined } })} opcoes={Object.entries(LOGISTICAS).map(([k, v]) => [k as Logistica, `${v.nome} (${k})`])} />
            </Grid>
            <Grid item xs={12}>
              <ToggleButtonGroup exclusive size="small" color="primary" value={f.tributacao.modo} onChange={(_, v) => v && set({ tributacao: { modo: v } })} sx={{ flexWrap: 'wrap' }}>
                <ToggleButton value="regime_empresa">Regime da empresa{perfil ? ` (${perfil.regimeAtual === 'simples' ? 'Simples' : 'Lucro Real'})` : ''}</ToggleButton>
                <ToggleButton value="comparar">Comparar Simples × Lucro Real</ToggleButton>
              </ToggleButtonGroup>
            </Grid>
          </Grid>
        </Secao>

        <Secao
          titulo="Caixas por venda"
          subtitulo="As caixas pertencem ao produto vendido (ex.: um sofá em duas caixas). Peso real em kg; medidas em cm."
          acao={<Button size="small" startIcon={<AddIcon />} onClick={() => set({ caixas: [...f.caixas, { quantidade: 1, pesoKg: '', comprimentoCm: '', larguraCm: '', alturaCm: '' }] })}>Caixa</Button>}
        >
          {f.caixas.map((c, i) => {
            const up = (patch: Partial<typeof c>) => set({ caixas: f.caixas.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            return (
              <Grid container spacing={1} key={i} sx={{ mb: 1 }} alignItems="flex-start">
                <Grid item xs={12} sm="auto"><Typography variant="body2" sx={{ pt: 1, minWidth: 56 }}>Caixa {i + 1}</Typography></Grid>
                <Grid item xs={4} sm={1.6}><TextField label="Qtd." type="number" inputProps={{ min: 1 }} value={c.quantidade} onChange={(e) => up({ quantidade: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} /></Grid>
                <Grid item xs={8} sm={2.2}><NumField label="Peso real" sufixo="kg" obrigatorio value={c.pesoKg} onChange={(v) => up({ pesoKg: v })} /></Grid>
                <Grid item xs={4} sm={2}><NumField label="Compr." sufixo="cm" value={c.comprimentoCm} onChange={(v) => up({ comprimentoCm: v })} /></Grid>
                <Grid item xs={4} sm={2}><NumField label="Larg." sufixo="cm" value={c.larguraCm} onChange={(v) => up({ larguraCm: v })} /></Grid>
                <Grid item xs={4} sm={2}><NumField label="Alt." sufixo="cm" value={c.alturaCm} onChange={(v) => up({ alturaCm: v })} /></Grid>
                <Grid item xs={12} sm="auto">
                  <IconButton aria-label={`remover caixa ${i + 1}`} disabled={f.caixas.length === 1} onClick={() => set({ caixas: f.caixas.filter((_, j) => j !== i) })}><DeleteIcon /></IconButton>
                </Grid>
              </Grid>
            );
          })}
        </Secao>

        <Secao titulo="Frete do vendedor">
          <ToggleButtonGroup exclusive size="small" color="primary" value={f.frete.modo} onChange={(_, v) => v && set({ frete: { ...f.frete, modo: v } })} sx={{ mb: 1.5 }}>
            <ToggleButton value="tabela">Tabela de frete</ToggleButton>
            <ToggleButton value="manual">Cotação manual da remessa</ToggleButton>
          </ToggleButtonGroup>
          {f.frete.modo === 'tabela' ? (
            <Grid container spacing={1.5}>
              <Grid item xs={12} md={8}>
                <TextField select label="Tabela aplicável à modalidade" value={f.frete.tabelaId ?? ''} onChange={(e) => set({ frete: { ...f.frete, tabelaId: e.target.value } })} helperText={tabelasAplicaveis.length ? undefined : 'Nenhuma tabela cadastrada para esta modalidade — cadastre na aba "Tabelas de frete" ou use cotação manual'}>
                  {tabelasAplicaveis.map((t) => (
                    <MenuItem key={t.id} value={t.id}>{t.nome} · vigência {dataBR(t.vigenciaInicio)} a {t.vigenciaFim ? dataBR(t.vigenciaFim) : '—'}{t.demo ? ' · FICTÍCIA' : ''}</MenuItem>
                  ))}
                </TextField>
              </Grid>
              {tabelaSel?.linhas.some((l) => l.regiao) && (
                <Grid item xs={12} md={4}>
                  <TextField select label="Região de destino" value={f.frete.regiao ?? ''} onChange={(e) => set({ frete: { ...f.frete, regiao: e.target.value } })}>
                    {[...new Set(tabelaSel.linhas.map((l) => l.regiao).filter(Boolean))].map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                  </TextField>
                </Grid>
              )}
            </Grid>
          ) : (
            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={4}><NumField label="Frete da remessa completa" prefixo="R$" obrigatorio value={f.frete.manual?.valor} onChange={(v) => set({ frete: { ...f.frete, manual: { origem: f.frete.manual?.origem ?? '', valor: v } } })} /></Grid>
              <Grid item xs={12} sm={8}><TextField label="Origem da cotação (obrigatório)" placeholder="Ex.: simulador ML em 27/11/2026, transportadora X" value={f.frete.manual?.origem ?? ''} onChange={(e) => set({ frete: { ...f.frete, manual: { valor: f.frete.manual?.valor ?? '', origem: e.target.value } } })} /></Grid>
            </Grid>
          )}
        </Secao>

        <Secao titulo="Tarifas do Mercado Livre" subtitulo={modoDemo ? 'Modo demonstração: tarifas fictícias.' : 'Consultadas na API oficial (listing_prices) para cada preço candidato.'}>
          <Grid container spacing={1.5}>
            <Grid item xs={12} sm={6}>
              <Selecao<BasePreco> label="Base de cálculo da tarifa" value={f.tarifas.base} onChange={(v) => set({ tarifas: { ...f.tarifas, base: v } })} opcoes={BASES} helperText="Preço enviado à API. Confira a regra da campanha quando houver cupom." />
            </Grid>
            {(['gold_special', 'gold_pro'] as TipoAnuncio[]).map((t) => (
              <Grid item xs={12} key={t}>
                <AjusteTarifaCampo tipo={t} valor={f.tarifas.ajustes[t]} onChange={(a) => set({ tarifas: { ...f.tarifas, ajustes: { ...f.tarifas.ajustes, [t]: a } } })} />
              </Grid>
            ))}
          </Grid>
        </Secao>

        <Secao titulo="Cupom e promoção" acao={<Switch checked={f.promocao.ativo} onChange={(e) => set({ promocao: { ...f.promocao, ativo: e.target.checked } })} />}>
          <Collapse in={f.promocao.ativo}>
            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={4}><Selecao label="Tipo de desconto" value={f.promocao.tipoDesconto} onChange={(v) => set({ promocao: { ...f.promocao, tipoDesconto: v } })} opcoes={[['valor', 'Valor (R$)'], ['percentual', '% do preço anunciado']]} /></Grid>
              <Grid item xs={12} sm={4}><NumField label="Desconto total ao comprador" prefixo={f.promocao.tipoDesconto === 'valor' ? 'R$' : undefined} sufixo={f.promocao.tipoDesconto === 'percentual' ? '%' : undefined} value={f.promocao.desconto} onChange={(v) => set({ promocao: { ...f.promocao, desconto: v } })} /></Grid>
              <Grid item xs={12} sm={4}><Selecao label="Reembolso do Mercado Livre" value={f.promocao.reembolsoML.estado} onChange={(v) => set({ promocao: { ...f.promocao, reembolsoML: { ...f.promocao.reembolsoML, estado: v } } })} opcoes={[['nao_informado', 'Não informado (loja custeia tudo)'], ['informado', 'Informado']]} /></Grid>
              {f.promocao.reembolsoML.estado === 'informado' && (
                <>
                  <Grid item xs={12} sm={6}><Selecao label="Forma do reembolso" value={f.promocao.reembolsoML.tipo} onChange={(v) => set({ promocao: { ...f.promocao, reembolsoML: { ...f.promocao.reembolsoML, tipo: v } } })} opcoes={[['valor', 'Valor (R$)'], ['percentual_desconto', '% do desconto']]} /></Grid>
                  <Grid item xs={12} sm={6}><NumField label="Parcela custeada pelo Mercado Livre" prefixo={f.promocao.reembolsoML.tipo === 'valor' ? 'R$' : undefined} sufixo={f.promocao.reembolsoML.tipo === 'valor' ? undefined : '%'} value={f.promocao.reembolsoML.valor} onChange={(v) => set({ promocao: { ...f.promocao, reembolsoML: { ...f.promocao.reembolsoML, valor: v } } })} /></Grid>
                </>
              )}
              <Grid item xs={12}><Typography variant="caption" color="text.secondary">O comprador paga o preço anunciado menos o desconto total. Sua receita é o preço anunciado menos a parte que a loja custeia. O cupom é descontado uma única vez.</Typography></Grid>
            </Grid>
          </Collapse>
        </Secao>

        <Secao titulo="Mercado Ads" acao={<Switch checked={f.ads.ativo} onChange={(e) => set({ ads: { ...f.ads, ativo: e.target.checked } })} />}>
          <Collapse in={f.ads.ativo}>
            <Grid container spacing={1.5}>
              <Grid item xs={12} sm={4}><Selecao label="Forma" value={f.ads.tipo} onChange={(v) => set({ ads: { ...f.ads, tipo: v } })} opcoes={[['percentual', '% sobre uma base'], ['valor', 'R$ por venda']]} /></Grid>
              <Grid item xs={12} sm={4}><NumField label="Investimento" prefixo={f.ads.tipo === 'valor' ? 'R$' : undefined} sufixo={f.ads.tipo === 'percentual' ? '%' : undefined} value={f.ads.valor} onChange={(v) => set({ ads: { ...f.ads, valor: v } })} /></Grid>
              {f.ads.tipo === 'percentual' && <Grid item xs={12} sm={4}><Selecao<BasePreco> label="Base" value={f.ads.base} onChange={(v) => set({ ads: { ...f.ads, base: v } })} opcoes={BASES} /></Grid>}
            </Grid>
          </Collapse>
        </Secao>

        <Secao titulo="Reserva para devoluções, avarias e logística reversa" acao={<Switch checked={f.devolucoes.ativo} onChange={(e) => set({ devolucoes: { ...f.devolucoes, ativo: e.target.checked, eventos: f.devolucoes.eventos.length ? f.devolucoes.eventos : [{ nome: 'Devolução', modo: 'probabilidade', probabilidadePct: '', prejuizoMedio: '' }] } })} />}>
          <Collapse in={f.devolucoes.ativo}>
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 1 }}>Separe eventos distintos (devolução, avaria, reversa) sem sobrepor o mesmo prejuízo em dois eventos.</Typography>
            {f.devolucoes.eventos.map((ev, i) => {
              const up = (p: Partial<typeof ev>) => set({ devolucoes: { ...f.devolucoes, eventos: f.devolucoes.eventos.map((x, j) => (j === i ? { ...x, ...p } : x)) } });
              return (
                <Grid container spacing={1} key={i} sx={{ mb: 1 }}>
                  <Grid item xs={12} sm={3}><TextField label="Evento" value={ev.nome} onChange={(e) => up({ nome: e.target.value })} /></Grid>
                  <Grid item xs={12} sm={3}><Selecao label="Forma" value={ev.modo} onChange={(v) => up({ modo: v })} opcoes={[['probabilidade', 'Probabilidade × prejuízo'], ['valor', 'Valor médio por venda']]} /></Grid>
                  {ev.modo === 'valor' ? (
                    <Grid item xs={10} sm={5}><NumField label="Valor por venda" prefixo="R$" value={ev.valor} onChange={(v) => up({ valor: v })} /></Grid>
                  ) : (
                    <>
                      <Grid item xs={5} sm={2.5}><NumField label="Probabilidade" sufixo="%" value={ev.probabilidadePct} onChange={(v) => up({ probabilidadePct: v })} /></Grid>
                      <Grid item xs={5} sm={2.5}><NumField label="Prejuízo líquido" prefixo="R$" value={ev.prejuizoMedio} onChange={(v) => up({ prejuizoMedio: v })} /></Grid>
                    </>
                  )}
                  <Grid item xs={2} sm={1}><IconButton aria-label="remover evento" onClick={() => set({ devolucoes: { ...f.devolucoes, eventos: f.devolucoes.eventos.filter((_, j) => j !== i) } })}><DeleteIcon /></IconButton></Grid>
                </Grid>
              );
            })}
            <Button size="small" startIcon={<AddIcon />} onClick={() => set({ devolucoes: { ...f.devolucoes, eventos: [...f.devolucoes.eventos, { nome: '', modo: 'probabilidade', probabilidadePct: '', prejuizoMedio: '' }] } })}>Evento</Button>
          </Collapse>
        </Secao>

        <Secao titulo="Despesas fixas" acao={<Switch checked={f.despesasFixas.ativo} onChange={(e) => set({ despesasFixas: { ...f.despesasFixas, ativo: e.target.checked, itens: f.despesasFixas.itens.length ? f.despesasFixas.itens : [{ nome: 'Estrutura', modo: 'mensal', valor: '', volumeMensal: '' }] } })} />}>
          <Collapse in={f.despesasFixas.ativo}>
            {f.despesasFixas.itens.map((it, i) => {
              const up = (p: Partial<typeof it>) => set({ despesasFixas: { ...f.despesasFixas, itens: f.despesasFixas.itens.map((x, j) => (j === i ? { ...x, ...p } : x)) } });
              return (
                <Grid container spacing={1} key={i} sx={{ mb: 1 }}>
                  <Grid item xs={12} sm={3}><TextField label="Despesa" value={it.nome} onChange={(e) => up({ nome: e.target.value })} /></Grid>
                  <Grid item xs={12} sm={3}><Selecao label="Rateio" value={it.modo} onChange={(v) => up({ modo: v })} opcoes={[['mensal', 'Total mensal ÷ volume'], ['por_venda', 'R$ por venda'], ['percentual_receita', '% da receita']]} /></Grid>
                  <Grid item xs={it.modo === 'mensal' ? 5 : 10} sm={it.modo === 'mensal' ? 2.5 : 5}><NumField label={it.modo === 'mensal' ? 'Total mensal' : 'Valor'} prefixo={it.modo === 'percentual_receita' ? undefined : 'R$'} sufixo={it.modo === 'percentual_receita' ? '%' : undefined} value={it.valor} onChange={(v) => up({ valor: v })} /></Grid>
                  {it.modo === 'mensal' && <Grid item xs={5} sm={2.5}><NumField label="Vendas/mês" value={it.volumeMensal} onChange={(v) => up({ volumeMensal: v })} /></Grid>}
                  <Grid item xs={2} sm={1}><IconButton aria-label="remover despesa" onClick={() => set({ despesasFixas: { ...f.despesasFixas, itens: f.despesasFixas.itens.filter((_, j) => j !== i) } })}><DeleteIcon /></IconButton></Grid>
                </Grid>
              );
            })}
            <Button size="small" startIcon={<AddIcon />} onClick={() => set({ despesasFixas: { ...f.despesasFixas, itens: [...f.despesasFixas.itens, { nome: '', modo: 'por_venda', valor: '' }] } })}>Despesa</Button>
          </Collapse>
        </Secao>

        <Box sx={{ position: 'sticky', bottom: 0, py: 1.5, bgcolor: 'background.default', zIndex: 2, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Button variant="contained" size="large" startIcon={carregando ? <CircularProgress size={18} color="inherit" /> : <CalculateIcon />} onClick={calcular} disabled={carregando} sx={{ flex: { xs: 1, sm: 'none' } }}>
            Calcular preço para minha margem
          </Button>
          <Button color="inherit" onClick={() => { setF(formInicial()); setRes(null); }}>Limpar</Button>
        </Box>
      </Grid>

      <Grid item xs={12} lg={5}>
        <Box ref={painel} data-testid="painel-resultado" sx={{ position: { lg: 'sticky' }, top: { lg: 16 }, scrollMarginTop: 8 }}>
          {erro && <Alert severity="error" sx={{ mb: 2 }}>{erro}</Alert>}
          {carregando && <Alert severity="info" icon={<CircularProgress size={18} />}>Calculando… o resultado anterior foi descartado.</Alert>}
          {desatualizado && <Alert severity="warning" sx={{ mb: 2 }}>Entradas alteradas: o resultado anterior foi invalidado. Clique em “Calcular preço para minha margem”.</Alert>}
          {!carregando && !res && !erro && <Alert severity="info">Preencha a simulação e clique em “Calcular preço para minha margem”.</Alert>}
          {res && !desatualizado && !carregando && <Resultados res={res} />}
        </Box>
      </Grid>
    </Grid>
  );
}

function AjusteTarifaCampo({ tipo, valor, onChange }: { tipo: TipoAnuncio; valor?: AjusteTarifa; onChange: (a?: AjusteTarifa) => void }) {
  const ativo = !!valor;
  return (
    <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
      <FormControlLabel control={<Switch checked={ativo} onChange={(e) => onChange(e.target.checked ? { escopo: 'total', tipo: 'percentual', valor: '' } : undefined)} />} label={`Ajuste manual da tarifa ${NOME_TIPO_ANUNCIO[tipo]}`} />
      {valor && (
        <Grid container spacing={1} sx={{ mt: 0.5 }}>
          <Grid item xs={12} sm={4}><Selecao label="Escopo" value={valor.escopo} onChange={(v) => onChange({ ...valor, escopo: v, tipo: v === 'fixa' ? 'valor' : valor.tipo })} opcoes={[['total', 'Tarifa total'], ['percentual', 'Componente percentual'], ['fixa', 'Componente tarifa fixa']]} /></Grid>
          <Grid item xs={12} sm={3}><Selecao label="Tipo" value={valor.tipo} disabled={valor.escopo === 'fixa'} onChange={(v) => onChange({ ...valor, tipo: v })} opcoes={[['percentual', '% da base'], ['valor', 'R$']]} /></Grid>
          <Grid item xs={12} sm={5}><NumField label="Valor que substitui o consultado" obrigatorio prefixo={valor.tipo === 'valor' ? 'R$' : undefined} sufixo={valor.tipo === 'percentual' ? '%' : undefined} value={valor.valor} onChange={(v) => onChange({ ...valor, valor: v })} /></Grid>
          <Grid item xs={12}><TextField label="Motivo / fonte do ajuste" value={valor.motivo ?? ''} onChange={(e) => onChange({ ...valor, motivo: e.target.value })} /></Grid>
        </Grid>
      )}
    </Box>
  );
}

function BuscaCategoria({ valor, onChange }: { valor: { id: string; nome?: string } | null; onChange: (c: { id: string; nome?: string } | null) => void }) {
  const [texto, setTexto] = useState('');
  const [opcoes, setOpcoes] = useState<Categoria[]>([]);
  const [aviso, setAviso] = useState<string | undefined>();
  const [carregando, setCarregando] = useState(false);
  useEffect(() => {
    const q = texto.trim();
    if (q.length < 2 || /^MLB\d+$/i.test(q)) return;
    const t = setTimeout(async () => {
      setCarregando(true);
      try {
        const r = await api.categorias(q);
        setOpcoes(r.itens);
        setAviso(r.aviso ? `${r.fonte}: ${r.aviso}` : undefined);
      } catch (e) {
        setAviso((e as Error).message);
      } finally {
        setCarregando(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [texto]);
  return (
    <Autocomplete
      freeSolo
      options={opcoes}
      loading={carregando}
      value={valor ? { id: valor.id, nome: valor.nome ?? '' } : null}
      filterOptions={(x) => x}
      getOptionLabel={(o) => (typeof o === 'string' ? o : `${o.nome ? `${o.nome} · ` : ''}${o.id}`)}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      onInputChange={(_, v) => setTexto(v)}
      onChange={(_, v) => {
        if (typeof v === 'string') {
          const id = v.trim().toUpperCase();
          onChange(/^MLB\d+$/.test(id) ? { id } : null);
        } else onChange(v ? { id: v.id, nome: v.nome } : null);
      }}
      renderOption={(props, o) => (
        <li {...props} key={o.id}>
          <Stack><span>{o.nome} <small>({o.id})</small></span>{o.caminho && <Typography variant="caption" color="text.secondary">{o.caminho}</Typography>}</Stack>
        </li>
      )}
      renderInput={(p) => <TextField {...p} label="Categoria do Mercado Livre" placeholder="Pesquise (ex.: sofá) ou digite o ID MLB…" helperText={aviso ?? (valor ? `Selecionada: ${valor.id}` : 'Obrigatória para consultar a tarifa')} />}
    />
  );
}
