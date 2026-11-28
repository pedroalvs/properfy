// Currency formatting lives in @properfy/shared so web and PWA agree (mirrors
// format-date / api-error). Re-exported here to keep the `@/lib/format-currency`
// import path stable for existing callers.
export { formatCurrency } from '@properfy/shared';

/**
 * Whole-dollar AUD, e.g. `$20` (no cents). Used for the Offers card's
 * per-inspection "From $X" headline. Floors rather than rounds so a "from"
 * minimum is never overstated (e.g. $19.50 → "$19", not "$20").
 */
export function formatCurrencyWhole(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.floor(amount));
}
