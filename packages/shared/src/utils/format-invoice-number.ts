/**
 * Presentation formatting for inspector Property Invoice numbers.
 *
 * The raw sequential number (an integer, assigned only at approval) is the identity/sort key.
 * `formatInvoiceNumber` produces the human-facing display string (e.g. `PINV-000123`). Raw UUIDs
 * are never shown to users; this helper is the single source of the displayed number.
 */
export const INVOICE_NUMBER_PREFIX = 'PINV-';
const INVOICE_NUMBER_PAD = 6;

export function formatInvoiceNumber(invoiceNumber: number | null | undefined): string | null {
  if (invoiceNumber === null || invoiceNumber === undefined) {
    return null;
  }
  if (!Number.isInteger(invoiceNumber) || invoiceNumber < 1) {
    throw new Error(`Invalid invoice number: ${invoiceNumber}`);
  }
  return `${INVOICE_NUMBER_PREFIX}${String(invoiceNumber).padStart(INVOICE_NUMBER_PAD, '0')}`;
}
