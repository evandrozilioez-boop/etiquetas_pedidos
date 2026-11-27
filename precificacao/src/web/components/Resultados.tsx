import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import {
  Alert, AlertTitle, Box, Button, Card, CardContent, Chip, Collapse, Divider, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography,
} from '@mui/material';
import { Fragment, useState } from 'react';
import type { ResultadoSimulacao } from '../../engine/simulate';
import type { ResultadoCenario, StatusPreco } from '../../engine/types';
import { NOME_REGIME, NOME_TIPO_ANUNCIO } from '../../engine/types';
import { brl, dataHoraBR, pctBR } from '../format';

const STATUS: Record<StatusPreco, { rotulo: string; cor: 'success' | 'info' | 'warning' | 'error' }> = {
  minimo_comprovado: { rotulo: 'Menor preço comprovado', cor: 'success' },
  validado: { rotulo: 'Preço validado para a meta', cor: 'info' },
  pendente: { rotulo: 'Dados pendentes', cor: 'warning' },
  inviavel: { rotulo: 'Meta inviável', cor: 'error' },
};

const nomeCenario = (c: ResultadoCenario, comparar: boolean) => `${NOME_TIPO_ANUNCIO[c.tipoAnuncio]}${comparar ? ` / ${NOME_REGIME[c.regime]}` : ''}`;

export default function Resultados({ res }: { res: ResultadoSimulacao }) {
  const comparar = res.modoTributario === 'comparar';
  const [aberto, setAberto] = useState<number | null>(null);
  return (
    <Box>
      {res.modoDemo && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <AlertTitle>Resultado de DEMONSTRAÇÃO</AlertTitle>
          Tarifas e frete fictícios. Não use estes valores para precificar anúncios reais.
        </Alert>
      )}
      {comparar ? (
        <Card variant="outlined" sx={{ mb: 2 }}>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Cenário</TableCell>
                  <TableCell align="right">Preço sugerido</TableCell>
                  <TableCell align="right">Sobra</TableCell>
                  <TableCell align="right">Margem</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {res.cenarios.map((c, i) => (
                  <Fragment key={i}>
                    <TableRow hover onClick={() => setAberto(aberto === i ? null : i)} sx={{ cursor: 'pointer' }}>
                      <TableCell>
                        <Typography variant="body2" fontWeight={600}>{nomeCenario(c, true)}</Typography>
                        <Chip size="small" variant="outlined" color={STATUS[c.status].cor} label={STATUS[c.status].rotulo} />
                      </TableCell>
                      <TableCell align="right"><b>{brl(c.avaliacao?.preco)}</b></TableCell>
                      <TableCell align="right">{brl(c.avaliacao?.resultado)}{c.margemFinalPendente ? '*' : ''}</TableCell>
                      <TableCell align="right">{c.avaliacao ? pctBR(c.avaliacao.margemPct) : '—'}{c.margemFinalPendente ? '*' : ''}</TableCell>
                      <TableCell padding="checkbox"><ExpandMoreIcon sx={{ transform: aberto === i ? 'rotate(180deg)' : 'none' }} /></TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell colSpan={5} sx={{ p: 0, border: aberto === i ? undefined : 0 }}>
                        <Collapse in={aberto === i} unmountOnExit><Box sx={{ p: 1.5 }}><Detalhe c={c} /></Box></Collapse>
                      </TableCell>
                    </TableRow>
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          </Box>
          {res.cenarios.some((c) => c.margemFinalPendente) && <Typography variant="caption" sx={{ px: 2, pb: 1, display: 'block' }}>* antes da provisão de IRPJ/CSLL — margem final pendente.</Typography>}
          <Box sx={{ px: 2, pb: 2 }}>
            <Typography variant="subtitle2">Premissas da comparação</Typography>
            <ul style={{ margin: 0, paddingLeft: 18 }}>{res.diferencasPremissas.map((d, i) => <li key={i}><Typography variant="body2">{d}</Typography></li>)}</ul>
          </Box>
        </Card>
      ) : (
        res.cenarios.map((c, i) => (
          <Card key={i} variant="outlined" sx={{ mb: 2 }}>
            <CardContent>
              <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1} flexWrap="wrap">
                <Typography variant="h6">{nomeCenario(c, false)} <Typography component="span" variant="body2" color="text.secondary">· {NOME_REGIME[c.regime]}</Typography></Typography>
                <Chip size="small" color={STATUS[c.status].cor} label={STATUS[c.status].rotulo} />
              </Stack>
              {c.avaliacao ? (
                <Stack direction="row" spacing={3} sx={{ my: 1 }} flexWrap="wrap" useFlexGap>
                  <Box><Typography variant="caption" color="text.secondary">Preço sugerido</Typography><Typography variant="h4" fontWeight={700} data-testid={`preco-${c.tipoAnuncio}`}>{brl(c.avaliacao.preco)}</Typography></Box>
                  <Box><Typography variant="caption" color="text.secondary">Sobra{c.margemFinalPendente ? ' (antes da provisão)' : ''}</Typography><Typography variant="h6">{brl(c.avaliacao.resultado)}</Typography></Box>
                  <Box><Typography variant="caption" color="text.secondary">Margem{c.margemFinalPendente ? ' (pendente)' : ''}</Typography><Typography variant="h6">{pctBR(c.avaliacao.margemPct)}</Typography></Box>
                </Stack>
              ) : null}
              <Typography variant="body2" color="text.secondary">{c.mensagem}</Typography>
              <Pendencias c={c} />
              {c.avaliacao && (
                <>
                  <Button size="small" sx={{ mt: 1 }} endIcon={<ExpandMoreIcon sx={{ transform: aberto === i ? 'rotate(180deg)' : 'none' }} />} onClick={() => setAberto(aberto === i ? null : i)}>
                    {aberto === i ? 'Ocultar' : 'Ver'} memória de cálculo
                  </Button>
                  <Collapse in={aberto === i} unmountOnExit><Divider sx={{ my: 1 }} /><Detalhe c={c} semResumo /></Collapse>
                </>
              )}
            </CardContent>
          </Card>
        ))
      )}
      <Typography variant="caption" color="text.secondary">Calculado em {dataHoraBR(res.geradoEm)}.</Typography>
    </Box>
  );
}

function Pendencias({ c }: { c: ResultadoCenario }) {
  return (
    <>
      {c.pendencias.length > 0 && (
        <Alert severity="warning" sx={{ mt: 1 }}>
          <AlertTitle>Campos pendentes</AlertTitle>
          <ul style={{ margin: 0, paddingLeft: 18 }}>{c.pendencias.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </Alert>
      )}
      {c.status === 'inviavel' && <Alert severity="error" sx={{ mt: 1 }}>{c.mensagem}</Alert>}
    </>
  );
}

function Detalhe({ c, semResumo }: { c: ResultadoCenario; semResumo?: boolean }) {
  const a = c.avaliacao;
  return (
    <Box>
      {!semResumo && (
        <>
          <Typography variant="body2" sx={{ mb: 1 }}>{c.mensagem}</Typography>
          <Pendencias c={c} />
        </>
      )}
      {a && (
        <>
          <Typography variant="subtitle2" sx={{ mt: 1 }}>Memória de cálculo</Typography>
          <Table size="small">
            <TableBody>
              {a.memoria.map((l) => (
                <TableRow key={l.chave} sx={{ bgcolor: l.tipo === 'subtotal' || l.tipo === 'resultado' ? 'action.hover' : undefined }}>
                  <TableCell sx={{ pl: l.tipo === 'informativo' ? 3 : 1 }}>
                    <Typography variant="body2" fontWeight={l.tipo === 'subtotal' || l.tipo === 'resultado' ? 700 : 400} color={l.tipo === 'informativo' ? 'text.secondary' : undefined}>
                      {l.rotulo} {l.manual && <Chip size="small" color="warning" label="ajuste manual" sx={{ ml: 0.5 }} />}
                    </Typography>
                    {l.detalhe && <Typography variant="caption" color="text.secondary" display="block">{l.detalhe}</Typography>}
                    {l.fonte && <Typography variant="caption" color="primary" display="block">Fonte: {l.fonte}</Typography>}
                  </TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap', color: l.tipo === 'informativo' ? 'text.secondary' : undefined, fontWeight: l.tipo === 'resultado' ? 700 : 400 }}>{brl(l.valor)}</TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell><b>Margem = resultado ÷ receita do vendedor</b></TableCell>
                <TableCell align="right"><b>{pctBR(a.margemPct)}</b></TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <Typography variant="subtitle2" sx={{ mt: 2 }}>Tarifa</Typography>
          <Typography variant="body2">
            Fonte: {c.tarifaInfo?.fonte}
            {c.tarifaInfo?.consultado && <> · consultada em {dataHoraBR(c.tarifaInfo.consultado.consultadoEm)} para R$ {c.tarifaInfo.consultado.precoConsultado.replace('.', ',')}: total {brl(c.tarifaInfo.consultado.total)} (percentual {c.tarifaInfo.consultado.percentual.replace('.', ',')}%, tarifa fixa {brl(c.tarifaInfo.consultado.fixa)}{c.tarifaInfo.consultado.financiamento ? `, parcelamento ${c.tarifaInfo.consultado.financiamento.replace('.', ',')}% já incluído` : ''})</>}
            {c.tarifaInfo && <> · {c.tarifaInfo.consultas} consulta(s) nesta simulação</>}
          </Typography>

          <Typography variant="subtitle2" sx={{ mt: 2 }}>Frete</Typography>
          <Typography variant="body2">{a.frete_detalhe.fonte}{a.frete_detalhe.vigencia ? ` · vigência ${a.frete_detalhe.vigencia}` : ''}{a.frete_detalhe.demo ? ' · FICTÍCIA' : ''}</Typography>
          <Typography variant="body2" color="text.secondary">{a.frete_detalhe.regra}</Typography>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size="small">
              <TableHead>
                <TableRow><TableCell>Caixa</TableCell><TableCell>Qtd.</TableCell><TableCell>Medidas</TableCell><TableCell>Peso real</TableCell><TableCell>Peso cúbico</TableCell><TableCell>Faturável</TableCell><TableCell>Enquadramento</TableCell></TableRow>
              </TableHead>
              <TableBody>
                {a.frete_detalhe.caixas.map((cx) => (
                  <TableRow key={cx.indice}>
                    <TableCell>{cx.indice}</TableCell><TableCell>{cx.quantidade}</TableCell><TableCell sx={{ whiteSpace: 'nowrap' }}>{cx.dimensoes}</TableCell>
                    <TableCell>{cx.pesoRealKg.replace('.', ',')} kg</TableCell><TableCell>{cx.pesoCubicoKg ? `${cx.pesoCubicoKg.replace('.', ',')} kg` : '—'}</TableCell>
                    <TableCell>{cx.pesoFaturavelKg === '-' ? '—' : `${cx.pesoFaturavelKg.replace('.', ',')} kg`}</TableCell><TableCell><Typography variant="caption">{cx.enquadramento}</Typography></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </>
      )}
      {c.avisos.length > 0 && (
        <Alert severity="info" sx={{ mt: 2 }}>
          <ul style={{ margin: 0, paddingLeft: 18 }}>{c.avisos.map((p, i) => <li key={i}>{p}</li>)}</ul>
        </Alert>
      )}
      {c.diagnostico && c.diagnostico.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2">Faixas avaliadas</Typography>
          <ul style={{ margin: 0, paddingLeft: 18 }}>{c.diagnostico.map((p, i) => <li key={i}><Typography variant="caption">{p}</Typography></li>)}</ul>
        </Box>
      )}
    </Box>
  );
}
