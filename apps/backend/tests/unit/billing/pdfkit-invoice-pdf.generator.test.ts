import { describe, it, expect } from 'vitest';
import { PdfKitInvoicePdfGenerator } from '../../../src/modules/billing/infrastructure/pdfkit-invoice-pdf.generator';
import type { InvoicePdfData } from '../../../src/modules/billing/domain/invoice-pdf-generator';

const baseData: InvoicePdfData = {
  invoiceNumberDisplay: 'PINV-000042',
  inspectorName: 'Jane Inspector',
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

  it('renders robustly when join-derived line fields are null', async () => {
    const buf = await new PdfKitInvoicePdfGenerator().generate({
      ...baseData,
      inspectorName: null,
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
