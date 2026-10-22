// Currency formatting lives in @properfy/shared so web and PWA agree (mirrors
// format-date / api-error). Re-exported here to keep the `@/lib/format-currency`
// import path stable for existing callers.
export { formatCurrency } from '@properfy/shared';
