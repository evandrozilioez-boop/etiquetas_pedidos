import { parseNumeroBR } from '../engine/csv';

export { parseNumeroBR };

const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export function brl(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '' || v === '-') return '—';
  const n = Number(v);
  return Number.isFinite(n) ? fmtBRL.format(n) : '—';
}
export function pctBR(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === '-' || v === '') return '—';
  return `${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}
/** "1234.5" (motor) → "1234,5" (tela). */
export function paraBR(v?: string): string {
  return v === undefined || v === null ? '' : String(v).replace('.', ',');
}
/** "1.234,5" (tela) → "1234.5" (motor); mantém o texto se inválido para o motor apontar a pendência. */
export function deBR(v?: string): string {
  if (v === undefined || v === null || v.trim() === '') return '';
  return parseNumeroBR(v) ?? `inválido:${v}`;
}
export function dataBR(iso?: string) {
  if (!iso) return '';
  const [a, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}
export function dataHoraBR(iso?: string) {
  return iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '';
}
export function hojeISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
export function novoId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
