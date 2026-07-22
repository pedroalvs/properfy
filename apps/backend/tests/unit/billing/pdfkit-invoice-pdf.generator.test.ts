import zlib from 'node:zlib';
import { describe, it, expect } from 'vitest';
import { PdfKitInvoicePdfGenerator } from '../../../src/modules/billing/infrastructure/pdfkit-invoice-pdf.generator';
import type { InvoicePdfData } from '../../../src/modules/billing/domain/invoice-pdf-generator';

/**
 * Extracts the visible text of a pdfkit document. pdfkit compresses page content streams
 * (FlateDecode) and exposes no option to disable it, so we inflate every `stream…endstream` block,
 * then decode the text-show tokens: pdfkit emits kerned `TJ` arrays where each run is a `<hex>`
 * (or `(literal)`) string. Concatenating those decoded runs reconstructs the rendered text.
 */
function extractPdfText(pdf: Buffer): string {
  const raw = pdf.toString('latin1');
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let content = '';
  let m: RegExpExecArray | null;
  while ((m = streamRe.exec(raw)) !== null) {
    const chunk = Buffer.from(m[1], 'latin1');
    try {
      content += zlib.inflateSync(chunk).toString('latin1');
    } catch {
      content += chunk.toString('latin1'); // uncompressed stream — use as-is
    }
  }

  const tokenRe = /<([0-9A-Fa-f\s]+)>|\(((?:\\.|[^\\()])*)\)/g;
  let out = '';
  let t: RegExpExecArray | null;
  while ((t = tokenRe.exec(content)) !== null) {
    if (t[1] !== undefined) {
      out += Buffer.from(t[1].replace(/\s+/g, ''), 'hex').toString('latin1');
    } else {
      out += t[2].replace(/\\([()\\])/g, '$1');
    }
  }
  return out;
}

const baseData: InvoicePdfData = {
  invoiceNumberDisplay: 'PINV-000042',
  inspectorName: 'Jane Inspector',
  inspectorAbn: '12 345 678 901',
  periodStart: '2026-03-01',
  periodEnd: '2026-03-15',
  issuedAt: '2026-03-16',
  currency: 'AUD',
  totalAmount: 700,
  lines: [
    { serviceDate: '2026-03-02', appointmentId: 'a1', appointmentCode: 'ABC-0001', propertyAddress: '1 Test St, Sydney NSW 2000', serviceType: 'Routine Inspection', amount: 350, agencyId: 'ag1', agencyName: 'Agency One', branchId: 'b1', branchName: 'Branch One' },
    { serviceDate: '2026-03-05', appointmentId: 'a2', appointmentCode: 'ABC-0002', propertyAddress: '2 Test Ave, Sydney NSW 2000', serviceType: 'Ingoing', amount: 350, agencyId: 'ag2', agencyName: 'Agency Two', branchId: 'b2', branchName: 'Branch Two' },
  ],
};

describe('PdfKitInvoicePdfGenerator', () => {
  it('produces a valid, non-empty PDF (pdfkit resolves under the test/build toolchain)', async () => {
    const buf = await new PdfKitInvoicePdfGenerator().generate(baseData);
    expect(buf).toBeInstanceOf(Buffer);
    expect(buf.length).toBeGreaterThan(200);
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('renders the ABN line under the inspector name when an ABN is present', async () => {
    const buf = await new PdfKitInvoicePdfGenerator().generate(baseData);
    const text = extractPdfText(buf);
    expect(text).toMatch(/Inspector: Jane Inspector\s*ABN: 12 345 678 901/);
  });

  it('omits the ABN line entirely when the inspector has no ABN', async () => {
    const buf = await new PdfKitInvoicePdfGenerator().generate({ ...baseData, inspectorAbn: null });
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(200);
    expect(extractPdfText(buf)).not.toContain('ABN');
  });

  it('renders robustly when join-derived line fields are null', async () => {
    const buf = await new PdfKitInvoicePdfGenerator().generate({
      ...baseData,
      inspectorName: null,
      inspectorAbn: null,
      issuedAt: null,
      lines: [
        { serviceDate: '2026-03-02', appointmentId: 'a1', appointmentCode: 'INS-0001', propertyAddress: null, serviceType: null, amount: 700, agencyId: null, agencyName: null, branchId: null, branchName: null },
      ],
    });
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(200);
  });

  it('handles a large snapshot spanning multiple pages', async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      serviceDate: '2026-03-02',
      appointmentId: `a${i}`,
      appointmentCode: `ABC-${String(i).padStart(4, '0')}`,
      propertyAddress: `${i} Long Street Name That Wraps, Sydney NSW 2000`,
      serviceType: 'Routine Inspection',
      amount: 100,
      agencyId: 'ag1',
      agencyName: 'Agency One',
      branchId: 'b1',
      branchName: 'Branch One',
    }));
    const buf = await new PdfKitInvoicePdfGenerator().generate({ ...baseData, totalAmount: 6000, lines: many });
    expect(buf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
