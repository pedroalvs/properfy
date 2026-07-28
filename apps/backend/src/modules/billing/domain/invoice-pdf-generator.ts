import type { InvoiceSnapshotLine } from '@properfy/shared';

/** Data required to render a Property Invoice PDF — all sourced from the frozen snapshot. */
export interface InvoicePdfData {
  invoiceNumberDisplay: string; // e.g. PINV-000123
  inspectorName: string | null;
  inspectorAbn: string | null;
  // Pre-formatted for display (dd/mm/yyyy) by the caller, which holds the Date
  // and can resolve the civil day in the platform timezone.
  periodStart: string; // dd/mm/yyyy
  periodEnd: string; // dd/mm/yyyy
  issuedAt: string | null; // dd/mm/yyyy
  currency: string;
  totalAmount: number;
  lines: InvoiceSnapshotLine[];
}

/** Port for rendering a Property Invoice document. */
export interface IInvoicePdfGenerator {
  generate(data: InvoicePdfData): Promise<Buffer>;
}
