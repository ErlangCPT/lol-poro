import type { Locale } from '@poro/core';

/** "64 %" in German, "64%" in English. */
export function pct(n: number, locale: Locale = 'de', digits = 0): string {
  const v = (n * 100).toFixed(digits);
  return locale === 'de' ? `${v} %` : `${v}%`;
}

export const f1 = (n: number) => n.toFixed(1);
export const f2 = (n: number) => n.toFixed(2);
export const fmtK = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
export const signed = (v: number) => (v > 0 ? `+${v}` : `${v}`);

export function kdaClass(ratio: number): string {
  if (ratio >= 4) return 'val-great';
  if (ratio >= 2.5) return 'val-good';
  if (ratio < 1.5) return 'val-bad';
  return '';
}

export function winrateClass(wr: number): string {
  if (wr >= 0.6) return 'val-great';
  if (wr >= 0.52) return 'val-good';
  if (wr < 0.45) return 'val-bad';
  return '';
}

export function games(n: number, locale: Locale): string {
  return locale === 'de' ? `${n} ${n === 1 ? 'Spiel' : 'Spiele'}` : `${n} ${n === 1 ? 'game' : 'games'}`;
}
