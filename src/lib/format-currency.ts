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

// BCP-47 hint for Intl.NumberFormat so R$ renders for BRL (with
// pt-BR thousands separator), € for EUR (with de-DE format), etc.
const CURRENCY_LOCALE: Record<string, string> = {
  BRL: "pt-BR",
  EUR: "de-DE",
  USD: "en-US",
  GBP: "en-GB",
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

/**
 * Locale-aware currency formatter for cents inputs. Used by every dashboard
 * widget — keeps R$ for BRL orgs, € for EUR, etc. AND keeps the thousands
 * separator that matches the locale ("1.234,56" for pt-BR, "1,234.56" for
 * en-US). Don't roll a per-widget formatCurrency — they drift apart and
 * pt-BR customers end up seeing "$" mixed with "R$" on the same dashboard.
 */
export function fmtCurrencyCents(cents: number, currency: string = "USD"): string {
  const locale = CURRENCY_LOCALE[currency] || "en-US";
  const dollars = Math.abs(cents) / 100;
  if (dollars >= 1_000_000) {
    return (
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        maximumFractionDigits: 1,
      }).format(dollars / 1_000_000) + "M"
    );
  }
  if (dollars >= 1_000) {
    return (
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        maximumFractionDigits: 1,
      }).format(dollars / 1_000) + "k"
    );
  }
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(dollars);
}
