import AddIcon from '@mui/icons-material/Add';
import DownloadIcon from '@mui/icons-material/Download';
import UploadIcon from '@mui/icons-material/UploadFile';
import {
  Alert, Box, Button, Card, CardActions, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Grid, MenuItem, Stack, Switch, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { useState } from 'react';
import { MODELO_CSV, type PreviaCSV } from '../../engine/csv';
import type { LinhaFrete, Logistica, TabelaFrete } from '../../engine/types';
import { LOGISTICAS, NOME_BASE } from '../../engine/types';
import { api, confirmar, ESTATICO } from '../api';
import { brl, dataBR, deBR, hojeISO, novoId, paraBR } from '../format';
import { NumField, Secao, Selecao } from './campos';

const REGRAS = { por_volume: 'Cobrança por volume (cada caixa enquadrada e somada)', conjunto: 'Cobrança pelo conjunto (soma dos pesos faturáveis)', nao_aceita: 'Não define regra para múltiplos volumes' };

function nova(): TabelaFrete {
  return {
    id: novoId(), nome: '', fonte: '', vigenciaInicio: hojeISO(), logisticas: ['drop_off'], baseFaixaPreco: 'pago_comprador', unidades: { peso: 'kg', dimensao: 'cm' },
    pesoCubico: { aplicar: false }, arredondamentoPeso: 'nenhum', regraVolumes: 'nao_aceita', limites: {}, linhas: [],
  };
}

const faixa = (l: LinhaFrete) => `${brl(l.precoMin)} a ${l.precoMax ? brl(l.precoMax) : 'sem limite'}`;

export default function Tabelas({ tabelas, recarregar }: { tabelas: TabelaFrete[]; recarregar: () => void }) {
  const [edit, setEdit] = useState<TabelaFrete | null>(null);
  const [ver, setVer] = useState<TabelaFrete | null>(null);
  const [csv, setCsv] = useState('');
  const [previa, setPrevia] = useState<PreviaCSV | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const cheia = useMediaQuery(useTheme().breakpoints.down('md'));

  const abrir = (t: TabelaFrete) => {
    setErro(null);
    setPrevia(null);
    setCsv('');
    setEdit(t);
  };

  async function validar() {
    setErro(null);
    try {
      setPrevia(await api.previaCSV(csv));
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  async function importar() {
    if (!edit || !previa || previa.erros.length) return;
    const l = edit.limites ?? {};
    const t: TabelaFrete = {
      ...edit,
      vigenciaFim: edit.vigenciaFim || undefined,
      pesoCubico: { aplicar: edit.pesoCubico.aplicar, divisor: edit.pesoCubico.aplicar ? deBR(edit.pesoCubico.divisor) : undefined },
      limites: {
        maiorLadoCm: l.maiorLadoCm ? deBR(l.maiorLadoCm) : undefined,
        somaLadosCm: l.somaLadosCm ? deBR(l.somaLadosCm) : undefined,
        pesoMaxKg: l.pesoMaxKg ? deBR(l.pesoMaxKg) : undefined,
        maxVolumes: l.maxVolumes || undefined,
      },
      linhas: previa.linhas,
    };
    try {
      await api.salvarTabela(t);
      setEdit(null);
      recarregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={1} sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">Tabelas oficiais verificáveis ou fornecidas por você. Só são aplicadas dentro da vigência e da modalidade cadastradas.</Typography>
        <Stack direction="row" spacing={1}>
          {ESTATICO ? (
            <Button startIcon={<DownloadIcon />} onClick={() => { abrir(nova()); setCsv(MODELO_CSV); }}>Ver modelo CSV</Button>
          ) : (
            <Button startIcon={<DownloadIcon />} href="/api/tabelas-frete/modelo.csv">Modelo CSV</Button>
          )}
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => abrir(nova())}>Importar tabela</Button>
        </Stack>
      </Stack>
      <Grid container spacing={2}>
        {tabelas.map((t) => (
          <Grid item xs={12} md={6} key={t.id}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6">{t.nome} {t.demo && <Chip size="small" color="warning" label="FICTÍCIA" />}</Typography>
                <Typography variant="body2" color="text.secondary">{t.fonte}</Typography>
                <Typography variant="body2">Vigência {dataBR(t.vigenciaInicio)} a {t.vigenciaFim ? dataBR(t.vigenciaFim) : 'sem data final'}{t.vigenciaFim && t.vigenciaFim < hojeISO() ? ' — VENCIDA' : ''}</Typography>
                <Typography variant="body2">Modalidades: {t.logisticas.map((l) => LOGISTICAS[l].nome).join(', ')}</Typography>
                <Typography variant="body2">{REGRAS[t.regraVolumes]} · {t.pesoCubico.aplicar ? `peso cúbico ÷ ${paraBR(t.pesoCubico.divisor)}` : 'sem peso cúbico'} · faixa de preço sobre {NOME_BASE[t.baseFaixaPreco]} · {t.linhas.length} faixas</Typography>
              </CardContent>
              <CardActions>
                <Button onClick={() => setVer(t)}>Ver faixas</Button>
                {!t.demo && <Button onClick={() => abrir({ ...t, pesoCubico: { ...t.pesoCubico, divisor: paraBR(t.pesoCubico.divisor) } })}>Editar / reimportar</Button>}
                {!t.demo && <Button color="error" onClick={async () => { if (confirmar(`Excluir a tabela ${t.nome}?`)) { await api.excluirTabela(t.id); recarregar(); } }}>Excluir</Button>}
              </CardActions>
            </Card>
          </Grid>
        ))}
        {!tabelas.length && <Grid item xs={12}><Alert severity="info">Nenhuma tabela cadastrada. Baixe o modelo CSV, preencha com a tabela da sua operação e importe.</Alert></Grid>}
      </Grid>

      <Dialog open={!!ver} onClose={() => setVer(null)} maxWidth="md" fullWidth fullScreen={cheia}>
        <DialogTitle>{ver?.nome}</DialogTitle>
        <DialogContent dividers>{ver && <TabelaLinhas linhas={ver.linhas} />}</DialogContent>
        <DialogActions><Button onClick={() => setVer(null)}>Fechar</Button></DialogActions>
      </Dialog>

      <Dialog open={!!edit} onClose={() => setEdit(null)} maxWidth="md" fullWidth fullScreen={cheia}>
        <DialogTitle>Tabela de frete</DialogTitle>
        <DialogContent dividers>
          {edit && (
            <>
              <Secao titulo="Identificação e regras de cobrança">
                <Grid container spacing={1.5}>
                  <Grid item xs={12} sm={6}><TextField label="Nome" value={edit.nome} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} /></Grid>
                  <Grid item xs={12} sm={6}><TextField label="Fonte (link oficial, contrato, data de download)" value={edit.fonte} onChange={(e) => setEdit({ ...edit, fonte: e.target.value })} /></Grid>
                  <Grid item xs={6}><TextField type="date" label="Vigência — início" InputLabelProps={{ shrink: true }} value={edit.vigenciaInicio} onChange={(e) => setEdit({ ...edit, vigenciaInicio: e.target.value })} /></Grid>
                  <Grid item xs={6}><TextField type="date" label="Vigência — fim" InputLabelProps={{ shrink: true }} value={edit.vigenciaFim ?? ''} onChange={(e) => setEdit({ ...edit, vigenciaFim: e.target.value || undefined })} /></Grid>
                  <Grid item xs={12}>
                    <TextField select label="Modalidades em que se aplica" SelectProps={{ multiple: true, renderValue: (v) => (v as string[]).join(', ') }} value={edit.logisticas} onChange={(e) => setEdit({ ...edit, logisticas: e.target.value as unknown as Logistica[] })}>
                      {Object.entries(LOGISTICAS).map(([k, v]) => <MenuItem key={k} value={k}>{v.nome} ({k})</MenuItem>)}
                    </TextField>
                  </Grid>
                  <Grid item xs={12} sm={6}><Selecao label="Faixa de preço avaliada sobre" value={edit.baseFaixaPreco} onChange={(v) => setEdit({ ...edit, baseFaixaPreco: v })} opcoes={Object.entries(NOME_BASE) as [TabelaFrete['baseFaixaPreco'], string][]} /></Grid>
                  <Grid item xs={12} sm={6}><Selecao label="Múltiplos volumes" value={edit.regraVolumes} onChange={(v) => setEdit({ ...edit, regraVolumes: v })} opcoes={Object.entries(REGRAS) as [TabelaFrete['regraVolumes'], string][]} /></Grid>
                  <Grid item xs={12} sm={4}><FormControlLabel control={<Switch checked={edit.pesoCubico.aplicar} onChange={(e) => setEdit({ ...edit, pesoCubico: { ...edit.pesoCubico, aplicar: e.target.checked } })} />} label="A tabela aplica peso cúbico" /></Grid>
                  <Grid item xs={6} sm={4}><NumField label="Divisor (cm³ por kg)" disabled={!edit.pesoCubico.aplicar} value={edit.pesoCubico.divisor} onChange={(v) => setEdit({ ...edit, pesoCubico: { ...edit.pesoCubico, divisor: v } })} /></Grid>
                  <Grid item xs={6} sm={4}><Selecao label="Arredondamento do peso" value={edit.arredondamentoPeso} onChange={(v) => setEdit({ ...edit, arredondamentoPeso: v })} opcoes={[['nenhum', 'Nenhum'], ['cima_0.1', 'Para cima, 0,1 kg'], ['cima_0.5', 'Para cima, 0,5 kg'], ['cima_1', 'Para cima, 1 kg']]} /></Grid>
                  <Grid item xs={6} sm={3}><NumField label="Maior lado máx." sufixo="cm" value={edit.limites?.maiorLadoCm} onChange={(v) => setEdit({ ...edit, limites: { ...edit.limites, maiorLadoCm: v } })} /></Grid>
                  <Grid item xs={6} sm={3}><NumField label="Soma dos lados máx." sufixo="cm" value={edit.limites?.somaLadosCm} onChange={(v) => setEdit({ ...edit, limites: { ...edit.limites, somaLadosCm: v } })} /></Grid>
                  <Grid item xs={6} sm={3}><NumField label="Peso máx. por volume" sufixo="kg" value={edit.limites?.pesoMaxKg} onChange={(v) => setEdit({ ...edit, limites: { ...edit.limites, pesoMaxKg: v } })} /></Grid>
                  <Grid item xs={6} sm={3}><TextField label="Volumes máx." type="number" value={edit.limites?.maxVolumes ?? ''} onChange={(e) => setEdit({ ...edit, limites: { ...edit.limites, maxVolumes: Number(e.target.value) || undefined } })} /></Grid>
                  <Grid item xs={12}><Typography variant="caption" color="text.secondary">Unidades: peso em kg, dimensões em cm. Informe só o frete que cabe ao vendedor.</Typography></Grid>
                </Grid>
              </Secao>
              <Secao titulo="Faixas (CSV)" subtitulo="Separador ponto e vírgula, vírgula decimal. Cole o conteúdo ou carregue o arquivo.">
                <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
                  <Button component="label" size="small" startIcon={<UploadIcon />}>Carregar arquivo<input hidden type="file" accept=".csv,text/csv" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setCsv(await f.text()); setPrevia(null); } }} /></Button>
                  {edit.linhas.length > 0 && !csv && <Button size="small" onClick={() => setCsv(['preco_min;preco_max;peso_min_kg;peso_max_kg;regiao;custo', ...edit.linhas.map((l) => [l.precoMin, l.precoMax ?? '', l.pesoMin, l.pesoMax ?? '', l.regiao ?? '', l.custo].map((x) => paraBR(x)).join(';'))].join('\n'))}>Carregar faixas atuais</Button>}
                </Stack>
                <TextField multiline minRows={6} value={csv} onChange={(e) => { setCsv(e.target.value); setPrevia(null); }} placeholder="preco_min;preco_max;peso_min_kg;peso_max_kg;regiao;custo" InputProps={{ sx: { fontFamily: 'monospace', fontSize: 13 } }} />
                <Button sx={{ mt: 1 }} variant="outlined" onClick={validar} disabled={!csv.trim()}>Validar e ver prévia</Button>
                {previa && (
                  <Box sx={{ mt: 2 }}>
                    {previa.erros.length > 0 ? (
                      <Alert severity="error"><ul style={{ margin: 0, paddingLeft: 18 }}>{previa.erros.map((e, i) => <li key={i}>Linha {e.linha}: {e.mensagem}</li>)}</ul></Alert>
                    ) : (
                      <Alert severity="success">{previa.linhas.length} faixas válidas. Confira a prévia antes de importar.</Alert>
                    )}
                    {previa.avisos.map((a, i) => <Alert key={i} severity="warning" sx={{ mt: 1 }}>{a}</Alert>)}
                    <TabelaLinhas linhas={previa.linhas} />
                  </Box>
                )}
              </Secao>
              {erro && <Alert severity="error">{erro}</Alert>}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEdit(null)}>Cancelar</Button>
          <Button variant="contained" disabled={!previa || previa.erros.length > 0} onClick={importar}>Importar tabela</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function TabelaLinhas({ linhas }: { linhas: LinhaFrete[] }) {
  return (
    <Box sx={{ overflowX: 'auto', mt: 1 }}>
      <Table size="small">
        <TableHead><TableRow><TableCell>Preço</TableCell><TableCell>Peso faturável</TableCell><TableCell>Região</TableCell><TableCell align="right">Custo do vendedor</TableCell></TableRow></TableHead>
        <TableBody>
          {linhas.map((l, i) => (
            <TableRow key={i}>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{faixa(l)}</TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>acima de {paraBR(l.pesoMin)} até {l.pesoMax ? `${paraBR(l.pesoMax)} kg` : 'sem limite'}</TableCell>
              <TableCell>{l.regiao || 'todas'}</TableCell>
              <TableCell align="right">{brl(l.custo)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}
