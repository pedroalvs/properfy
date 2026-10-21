/**
 * Single source of truth for currency formatting across web and PWA.
 *
 * Properfy trades only in AUD today, so the default currency is AUD and the
 * locale is fixed to `en-AU`. `Intl.NumberFormat` already defaults to a
 * currency's minor units (AUD = 2), but the fraction digits are pinned
 * explicitly so the output never shifts if the locale/currency pair changes.
 */
export function formatCurrency(amount: number, currency = 'AUD'): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
