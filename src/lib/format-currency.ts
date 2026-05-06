/**
 * Shared currency formatting utility.
 * All UI currency formatting should go through this so the org's
 * configured currency is respected everywhere.
 */

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  BRL: "R$",
  EUR: "€",
  GBP: "£",
};

export function getCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] || "$";
}

export function fmtCurrency(value: number, currency: string = "USD"): string {
  const sym = getCurrencySymbol(currency);
  if (value >= 1_000_000) return `${sym}${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${sym}${(value / 1_000).toFixed(1)}k`;
  return `${sym}${Math.round(value)}`;
}
