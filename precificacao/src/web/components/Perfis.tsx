import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/DeleteOutline';
import {
  Alert, Box, Button, Card, CardActions, CardContent, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Grid, IconButton, Stack, Switch, TextField, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { useState } from 'react';
import type { CodigoTributo, Credito, Incidencia, Parametro, ParamLucroReal, ParamSimples, PerfilCnpj } from '../../engine/types';
import { NOME_BASE, NOME_REGIME } from '../../engine/types';
import { api } from '../api';
import { dataBR, deBR, hojeISO, novoId, paraBR } from '../format';
import { NOMES_ESTADO, NumField, ParametroField, Secao, Selecao } from './campos';

const TRIBUTOS: CodigoTributo[] = ['IRPJ', 'CSLL', 'PIS', 'COFINS', 'CPP', 'ICMS', 'ICMS_ST', 'DIFAL', 'IPI', 'ISS', 'IBS', 'CBS', 'OUTRO'];
const BASES = Object.entries(NOME_BASE) as [Incidencia['base'], string][];
const NAO: Parametro = { estado: 'nao_informado' };

const simplesVazio = (): ParamSimples => ({ descricao: '', vigenciaInicio: hojeISO(), aliquotaEfetiva: NAO, base: 'receita_vendedor', percentualBase: '100', tributosNoDAS: [], adicionais: [] });
const lucroRealVazio = (): ParamLucroReal => ({ descricao: '', vigenciaInicio: hojeISO(), tributos: [], creditos: [], provisao: { estado: 'nao_informado' } });

const mapParam = (p: Parametro, fn: (v?: string) => string): Parametro => (p.estado === 'informado' ? { ...p, valor: fn(p.valor) } : { estado: p.estado });
function converter(p: PerfilCnpj, fn: (v?: string) => string): PerfilCnpj {
  return {
    ...p,
    simples: p.simples && {
      ...p.simples,
      vigenciaFim: p.simples.vigenciaFim || undefined,
      aliquotaEfetiva: mapParam(p.simples.aliquotaEfetiva, fn),
      percentualBase: fn(p.simples.percentualBase),
      adicionais: p.simples.adicionais.map((a) => ({ ...a, aliquota: mapParam(a.aliquota, fn) })),
    },
    lucroReal: p.lucroReal && {
      ...p.lucroReal,
      vigenciaFim: p.lucroReal.vigenciaFim || undefined,
      tributos: p.lucroReal.tributos.map((a) => ({ ...a, aliquota: mapParam(a.aliquota, fn) })),
      creditos: p.lucroReal.creditos.map((c) => ({ ...c, valor: mapParam(c.valor, fn) })),
      provisao: { ...p.lucroReal.provisao, valor: p.lucroReal.provisao.valor !== undefined && p.lucroReal.provisao.estado === 'informado' ? fn(p.lucroReal.provisao.valor) : undefined },
    },
  };
}

export default function Perfis({ perfis, recarregar }: { perfis: PerfilCnpj[]; recarregar: () => void }) {
  const [edit, setEdit] = useState<PerfilCnpj | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const tema = useTheme();
  const cheia = useMediaQuery(tema.breakpoints.down('md'));

  async function salvar() {
    if (!edit) return;
    try {
      await api.salvarPerfil(converter(edit, (v) => deBR(v)));
      setEdit(null);
      recarregar();
    } catch (e) {
      setErro((e as Error).message);
    }
  }

  return (
    <Box>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
        <Typography variant="body2" color="text.secondary">Parâmetros fornecidos pelo contador, por CNPJ. Nenhum percentual é preenchido automaticamente.</Typography>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => { setErro(null); setEdit({ id: novoId(), cnpj: '', razaoSocial: '', regimeAtual: 'simples' }); }}>Novo perfil</Button>
      </Stack>
      <Grid container spacing={2}>
        {perfis.map((p) => (
          <Grid item xs={12} md={6} key={p.id}>
            <Card variant="outlined">
              <CardContent>
                <Typography variant="h6">{p.razaoSocial} {p.demo && <Chip size="small" color="warning" label="FICTÍCIO" />}</Typography>
                <Typography variant="body2" color="text.secondary">CNPJ {p.cnpj} · regime atual: {NOME_REGIME[p.regimeAtual]}</Typography>
                <Typography variant="body2" sx={{ mt: 1 }}>
                  Simples: {p.simples ? `DAS ${p.simples.aliquotaEfetiva.estado === 'informado' ? `${paraBR(p.simples.aliquotaEfetiva.valor)}%` : NOMES_ESTADO[p.simples.aliquotaEfetiva.estado].toLowerCase()} · vigência ${dataBR(p.simples.vigenciaInicio)}–${p.simples.vigenciaFim ? dataBR(p.simples.vigenciaFim) : '…'}` : 'não cadastrado'}
                </Typography>
                <Typography variant="body2">
                  Lucro Real: {p.lucroReal ? `${p.lucroReal.tributos.length} tributo(s), ${p.lucroReal.creditos.length} crédito(s), provisão ${p.lucroReal.provisao.estado === 'informado' ? 'informada' : 'PENDENTE'}` : 'não cadastrado'}
                </Typography>
              </CardContent>
              {!p.demo && (
                <CardActions>
                  <Button onClick={() => { setErro(null); setEdit(converter(p, paraBR)); }}>Editar</Button>
                  <Button color="error" onClick={async () => { if (confirm(`Excluir o perfil ${p.razaoSocial}?`)) { await api.excluirPerfil(p.id); recarregar(); } }}>Excluir</Button>
                </CardActions>
              )}
            </Card>
          </Grid>
        ))}
      </Grid>

      <Dialog open={!!edit} onClose={() => setEdit(null)} fullScreen={cheia} maxWidth="md" fullWidth>
        <DialogTitle>Perfil fiscal do CNPJ</DialogTitle>
        <DialogContent dividers>
          {edit && <EditorPerfil p={edit} set={setEdit} />}
          {erro && <Alert severity="error" sx={{ mt: 2 }}>{erro}</Alert>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEdit(null)}>Cancelar</Button>
          <Button variant="contained" onClick={salvar}>Salvar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function EditorPerfil({ p, set }: { p: PerfilCnpj; set: (p: PerfilCnpj) => void }) {
  const up = (patch: Partial<PerfilCnpj>) => set({ ...p, ...patch });
  const s = p.simples, r = p.lucroReal;
  return (
    <Box>
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={4}><TextField label="CNPJ" value={p.cnpj} onChange={(e) => up({ cnpj: e.target.value })} /></Grid>
        <Grid item xs={12} sm={5}><TextField label="Razão social" value={p.razaoSocial} onChange={(e) => up({ razaoSocial: e.target.value })} /></Grid>
        <Grid item xs={12} sm={3}><Selecao label="Regime atual" value={p.regimeAtual} onChange={(v) => up({ regimeAtual: v })} opcoes={[['simples', 'Simples Nacional'], ['lucro_real', 'Lucro Real']]} /></Grid>
      </Grid>

      <Secao titulo="Simples Nacional" acao={<Switch checked={!!s} onChange={(e) => up({ simples: e.target.checked ? simplesVazio() : undefined })} />}>
        {s && (() => {
          const us = (patch: Partial<ParamSimples>) => up({ simples: { ...s, ...patch } });
          return (
            <Grid container spacing={1.5}>
              <Grid item xs={12}><TextField label="Descrição / orientação do contador" value={s.descricao} onChange={(e) => us({ descricao: e.target.value })} /></Grid>
              <Vigencia v={s} on={(x) => us(x)} />
              <Grid item xs={12}><ParametroField label="Alíquota efetiva do DAS" value={s.aliquotaEfetiva} onChange={(v) => us({ aliquotaEfetiva: v })} /></Grid>
              <Grid item xs={12} sm={6}><Selecao label="Base de incidência" value={s.base} onChange={(v) => us({ base: v })} opcoes={BASES} /></Grid>
              <Grid item xs={12} sm={6}><NumField label="Parcela da base sujeita ao DAS" sufixo="%" value={s.percentualBase} onChange={(v) => us({ percentualBase: v })} helperText="100% salvo orientação diferente do contador" /></Grid>
              <Grid item xs={12}>
                <Typography variant="body2" sx={{ mb: 0.5 }}>Tributos já incluídos no DAS (não serão somados de novo):</Typography>
                <Stack direction="row" flexWrap="wrap" useFlexGap spacing={0.5}>
                  {TRIBUTOS.filter((t) => t !== 'OUTRO').map((t) => (
                    <Chip key={t} label={t} color={s.tributosNoDAS.includes(t) ? 'primary' : 'default'} variant={s.tributosNoDAS.includes(t) ? 'filled' : 'outlined'} onClick={() => us({ tributosNoDAS: s.tributosNoDAS.includes(t) ? s.tributosNoDAS.filter((x) => x !== t) : [...s.tributosNoDAS, t] })} />
                  ))}
                </Stack>
              </Grid>
              <Grid item xs={12}>
                <ListaIncidencias titulo="Incidências adicionais indicadas pelo contador" itens={s.adicionais} onChange={(a) => us({ adicionais: a })} noDAS={s.tributosNoDAS} />
              </Grid>
            </Grid>
          );
        })()}
      </Secao>

      <Secao titulo="Lucro Real" acao={<Switch checked={!!r} onChange={(e) => up({ lucroReal: e.target.checked ? lucroRealVazio() : undefined })} />}>
        {r && (() => {
          const ur = (patch: Partial<ParamLucroReal>) => up({ lucroReal: { ...r, ...patch } });
          const pv = r.provisao;
          return (
            <Grid container spacing={1.5}>
              <Grid item xs={12}><TextField label="Descrição / orientação do contador" value={r.descricao} onChange={(e) => ur({ descricao: e.target.value })} /></Grid>
              <Vigencia v={r} on={(x) => ur(x)} />
              <Grid item xs={12}><ListaIncidencias titulo="Tributos da operação" itens={r.tributos} onChange={(t) => ur({ tributos: t })} /></Grid>
              <Grid item xs={12}><ListaCreditos itens={r.creditos} onChange={(c) => ur({ creditos: c })} /></Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle2">Provisão gerencial de IRPJ/CSLL atribuída à venda</Typography>
                <Grid container spacing={1}>
                  <Grid item xs={12} sm={4}><Selecao label="Critério" value={pv.estado} onChange={(v) => ur({ provisao: { ...pv, estado: v } })} opcoes={[['nao_informado', 'Não informado (margem pendente)'], ['informado', 'Informado pelo contador']]} /></Grid>
                  {pv.estado === 'informado' && (
                    <>
                      <Grid item xs={12} sm={4}><Selecao label="Método" value={pv.metodo ?? 'percentual_resultado'} onChange={(v) => ur({ provisao: { ...pv, metodo: v } })} opcoes={[['percentual_resultado', '% do resultado antes da provisão'], ['percentual_receita', '% da receita'], ['valor_por_venda', 'R$ por venda']]} /></Grid>
                      <Grid item xs={12} sm={4}><NumField label="Valor" sufixo={pv.metodo === 'valor_por_venda' ? undefined : '%'} prefixo={pv.metodo === 'valor_por_venda' ? 'R$' : undefined} value={pv.valor} onChange={(v) => ur({ provisao: { ...pv, metodo: pv.metodo ?? 'percentual_resultado', valor: v } })} /></Grid>
                      <Grid item xs={12}><TextField label="Critério descrito pelo contador" value={pv.criterio ?? ''} onChange={(e) => ur({ provisao: { ...pv, criterio: e.target.value } })} /></Grid>
                    </>
                  )}
                </Grid>
              </Grid>
            </Grid>
          );
        })()}
      </Secao>
    </Box>
  );
}

function Vigencia({ v, on }: { v: { vigenciaInicio: string; vigenciaFim?: string }; on: (x: { vigenciaInicio?: string; vigenciaFim?: string }) => void }) {
  return (
    <>
      <Grid item xs={6}><TextField type="date" label="Vigência — início" InputLabelProps={{ shrink: true }} value={v.vigenciaInicio} onChange={(e) => on({ vigenciaInicio: e.target.value })} /></Grid>
      <Grid item xs={6}><TextField type="date" label="Vigência — fim (opcional)" InputLabelProps={{ shrink: true }} value={v.vigenciaFim ?? ''} onChange={(e) => on({ vigenciaFim: e.target.value || undefined })} /></Grid>
    </>
  );
}

function ListaIncidencias({ titulo, itens, onChange, noDAS = [] }: { titulo: string; itens: Incidencia[]; onChange: (i: Incidencia[]) => void; noDAS?: CodigoTributo[] }) {
  return (
    <Box>
      <Typography variant="subtitle2">{titulo}</Typography>
      {itens.map((it, i) => {
        const up = (patch: Partial<Incidencia>) => onChange(itens.map((x, j) => (j === i ? { ...x, ...patch } : x)));
        return (
          <Box key={it.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1, my: 1 }}>
            <Grid container spacing={1}>
              <Grid item xs={6} sm={2}><Selecao label="Tributo" value={it.tributo} onChange={(v) => up({ tributo: v })} opcoes={TRIBUTOS.map((t) => [t, t])} /></Grid>
              <Grid item xs={6} sm={4}><TextField label="Descrição" value={it.descricao} onChange={(e) => up({ descricao: e.target.value })} /></Grid>
              <Grid item xs={10} sm={5}><Selecao label="Base" value={it.base} onChange={(v) => up({ base: v })} opcoes={BASES} /></Grid>
              <Grid item xs={2} sm={1}><IconButton aria-label="remover" onClick={() => onChange(itens.filter((_, j) => j !== i))}><DeleteIcon /></IconButton></Grid>
              <Grid item xs={12}><ParametroField label="Alíquota" value={it.aliquota} onChange={(v) => up({ aliquota: v })} /></Grid>
              <Grid item xs={12}>
                <FormControlLabel control={<Checkbox size="small" checked={!!it.jaIncluidoNoCusto} onChange={(e) => up({ jaIncluidoNoCusto: e.target.checked })} />} label={<Typography variant="body2">Já incluído no custo de aquisição</Typography>} />
                {noDAS.includes(it.tributo) && <Alert severity="warning" sx={{ mt: 0.5 }}>{it.tributo} está marcado como incluído no DAS — esta linha será exibida mas não somada.</Alert>}
              </Grid>
            </Grid>
          </Box>
        );
      })}
      <Button size="small" startIcon={<AddIcon />} onClick={() => onChange([...itens, { id: novoId(), tributo: 'ICMS', descricao: '', aliquota: { estado: 'nao_informado' }, base: 'pago_comprador' }])}>Incidência</Button>
    </Box>
  );
}

function ListaCreditos({ itens, onChange }: { itens: Credito[]; onChange: (c: Credito[]) => void }) {
  return (
    <Box>
      <Typography variant="subtitle2">Créditos recuperáveis efetivamente parametrizados</Typography>
      {itens.map((it, i) => {
        const up = (patch: Partial<Credito>) => onChange(itens.map((x, j) => (j === i ? { ...x, ...patch } : x)));
        return (
          <Box key={it.id} sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1, my: 1 }}>
            <Grid container spacing={1}>
              <Grid item xs={6} sm={2}><Selecao label="Tributo" value={it.tributo} onChange={(v) => up({ tributo: v })} opcoes={TRIBUTOS.map((t) => [t, t])} /></Grid>
              <Grid item xs={6} sm={5}><TextField label="Descrição" value={it.descricao} onChange={(e) => up({ descricao: e.target.value })} /></Grid>
              <Grid item xs={10} sm={4}><Selecao label="Forma" value={it.tipo} onChange={(v) => up({ tipo: v })} opcoes={[['percentual', '% do custo de compra'], ['valor', 'R$ por venda']]} /></Grid>
              <Grid item xs={2} sm={1}><IconButton aria-label="remover" onClick={() => onChange(itens.filter((_, j) => j !== i))}><DeleteIcon /></IconButton></Grid>
              <Grid item xs={12}><ParametroField label="Crédito" sufixo={it.tipo === 'percentual' ? '%' : 'R$'} value={it.valor} onChange={(v) => up({ valor: v })} /></Grid>
              <Grid item xs={12}><FormControlLabel control={<Checkbox size="small" checked={it.jaAbatidoDoCusto} onChange={(e) => up({ jaAbatidoDoCusto: e.target.checked })} />} label={<Typography variant="body2">Já abatido do custo de aquisição informado (não será aproveitado de novo)</Typography>} /></Grid>
            </Grid>
          </Box>
        );
      })}
      <Button size="small" startIcon={<AddIcon />} onClick={() => onChange([...itens, { id: novoId(), tributo: 'PIS', descricao: '', tipo: 'percentual', valor: { estado: 'nao_informado' }, base: 'custo_compra', jaAbatidoDoCusto: false }])}>Crédito</Button>
    </Box>
  );
}
