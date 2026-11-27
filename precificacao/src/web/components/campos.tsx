import { InputAdornment, MenuItem, Paper, Stack, TextField, Typography, type TextFieldProps } from '@mui/material';
import type { ReactNode } from 'react';
import type { EstadoParametro, Parametro } from '../../engine/types';
import { parseNumeroBR } from '../format';

type NumProps = Omit<TextFieldProps, 'onChange' | 'value'> & {
  value: string | undefined;
  onChange: (v: string) => void;
  prefixo?: string;
  sufixo?: string;
  obrigatorio?: boolean;
};

/** Campo numérico em pt-BR (vírgula decimal). Vazio é "não informado", nunca zero. */
export function NumField({ value, onChange, prefixo, sufixo, obrigatorio, helperText, ...rest }: NumProps) {
  const v = value ?? '';
  const invalido = v.trim() !== '' && parseNumeroBR(v) === null;
  const vazio = obrigatorio && v.trim() === '';
  return (
    <TextField
      {...rest}
      value={v}
      onChange={(e) => onChange(e.target.value)}
      inputProps={{ inputMode: 'decimal', ...(rest.inputProps ?? {}) }}
      error={invalido || rest.error}
      helperText={invalido ? 'Use números com vírgula decimal, ex.: 1.234,56' : vazio ? 'Obrigatório (informe 0 se não houver)' : helperText}
      InputProps={{
        startAdornment: prefixo ? <InputAdornment position="start">{prefixo}</InputAdornment> : undefined,
        endAdornment: sufixo ? <InputAdornment position="end">{sufixo}</InputAdornment> : undefined,
      }}
    />
  );
}

export const NOMES_ESTADO: Record<EstadoParametro, string> = {
  informado: 'Informado',
  zero_confirmado: 'Zero confirmado',
  nao_se_aplica: 'Não se aplica',
  nao_informado: 'Não informado',
};

/** Parâmetro com estado explícito: diferencia zero confirmado, não se aplica e não informado. */
export function ParametroField({ label, value, onChange, sufixo = '%' }: { label: string; value: Parametro; onChange: (p: Parametro) => void; sufixo?: string }) {
  return (
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ width: '100%' }}>
      <TextField select label={`${label} — situação`} value={value.estado} onChange={(e) => onChange({ estado: e.target.value as EstadoParametro, valor: e.target.value === 'informado' ? value.valor : undefined })} sx={{ minWidth: 180 }}>
        {Object.entries(NOMES_ESTADO).map(([k, n]) => (
          <MenuItem key={k} value={k}>{n}</MenuItem>
        ))}
      </TextField>
      <NumField label={label} value={value.estado === 'informado' ? value.valor : ''} disabled={value.estado !== 'informado'} onChange={(v) => onChange({ estado: 'informado', valor: v })} sufixo={sufixo} obrigatorio={value.estado === 'informado'} />
    </Stack>
  );
}

export function Secao({ titulo, subtitulo, children, acao }: { titulo: string; subtitulo?: ReactNode; children: ReactNode; acao?: ReactNode }) {
  return (
    <Paper variant="outlined" sx={{ p: { xs: 1.5, sm: 2 }, mb: 2 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1.5 }} spacing={1}>
        <div>
          <Typography variant="subtitle1" fontWeight={700}>{titulo}</Typography>
          {subtitulo && <Typography variant="body2" color="text.secondary">{subtitulo}</Typography>}
        </div>
        {acao}
      </Stack>
      {children}
    </Paper>
  );
}

export function Selecao<T extends string>({ label, value, onChange, opcoes, ...rest }: Omit<TextFieldProps, 'onChange'> & { value: T; onChange: (v: T) => void; opcoes: [T, string][] }) {
  return (
    <TextField select label={label} value={value} onChange={(e) => onChange(e.target.value as T)} {...rest}>
      {opcoes.map(([k, n]) => (
        <MenuItem key={k} value={k}>{n}</MenuItem>
      ))}
    </TextField>
  );
}
