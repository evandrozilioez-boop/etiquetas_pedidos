import Decimal from 'decimal.js';

/** Aritmética decimal: nenhuma conta de dinheiro passa por ponto flutuante. */
export const Dec = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = Decimal;

export const ZERO = new Dec(0);
export const CENT = new Dec('0.01');
export const HUNDRED = new Dec(100);

/** Converte string com ponto decimal ("1234.56") ou número para Decimal. */
export function d(v: string | number | Decimal | undefined | null): Decimal {
  if (v === undefined || v === null || v === '') return new Dec(0);
  return new Dec(v as string);
}

/** Valor monetário arredondado em centavos (meio para cima). */
export function money(v: Decimal): Decimal {
  return v.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Arredonda para cima até o centavo. */
export function ceilCent(v: Decimal): Decimal {
  return v.toDecimalPlaces(2, Decimal.ROUND_CEIL);
}

export function pct(v: string | Decimal): Decimal {
  return d(v as string).div(HUNDRED);
}

/** Número válido em notação decimal com ponto. */
export function isNumeric(v: unknown): boolean {
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v !== 'string' || v.trim() === '') return false;
  return /^-?\d+(\.\d+)?$/.test(v.trim());
}

export function toCents(v: Decimal): number {
  return v.mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

export function fromCents(c: number): Decimal {
  return new Dec(c).div(100);
}

export { Decimal };
