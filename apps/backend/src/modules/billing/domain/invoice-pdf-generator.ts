import type { InvoiceSnapshotLine } from '@properfy/shared';

/** Data required to render a Property Invoice PDF — all sourced from the frozen snapshot. */
export interface InvoicePdfData {
  invoiceNumberDisplay: string; // e.g. PINV-000123
  inspectorName: string | null;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  issuedAt: string | null; // YYYY-MM-DD
  currency: string;
  totalAmount: number;
  lines: InvoiceSnapshotLine[];
}

/** Port for rendering a Property Invoice document. */
export interface IInvoicePdfGenerator {
  generate(data: InvoicePdfData): Promise<Buffer>;
}
