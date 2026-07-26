import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GenerateInvoiceFileWorker } from '../../../src/modules/billing/infrastructure/workers/generate-invoice-file.worker';
import { InspectorInvoiceEntity } from '../../../src/modules/billing/domain/inspector-invoice.entity';

const invoiceRepo = { findById: vi.fn(), update: vi.fn() };
const pdfGenerator = { generate: vi.fn() };
const storageService = { upload: vi.fn() };
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };

const SNAPSHOT = [
  { serviceDate: '2026-03-02', appointmentId: 'a1', appointmentCode: 'ABC-0001', propertyAddress: '1 St', serviceType: 'Routine', amount: 700, agencyId: 'ag1', agencyName: 'Agency', branchId: 'b1', branchName: 'Branch' },
];

function closedInvoice(overrides: Record<string, unknown> = {}) {
  return new InspectorInvoiceEntity({
    id: 'inv-1',
    invoiceNumber: 42,
    inspectorId: 'insp-1',
    inspectorName: 'Jane Inspector',
    inspectorAbn: '12 345 678 901',
    periodStart: new Date('2026-03-01'),
    periodEnd: new Date('2026-03-15'),
    periodType: 'FORTNIGHTLY',
    status: 'CLOSED',
    totalAmount: 700,
    currency: 'AUD',
    lineItemsSnapshot: SNAPSHOT,
    fileKey: null,
    previousInvoiceId: null,
    generatedByUserId: 'op-1',
    issuedAt: new Date('2026-03-16T00:00:00Z'),
    paidAt: null,
    paidByUserId: null,
    paymentReference: null,
    notes: null,
    draftedByInspectorId: 'insp-1',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

function makeWorker() {
  return new GenerateInvoiceFileWorker(invoiceRepo as any, pdfGenerator as any, storageService as any, logger as any);
}

describe('GenerateInvoiceFileWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pdfGenerator.generate.mockResolvedValue(Buffer.from('%PDF-fake'));
  });

  it('renders the PDF from the frozen snapshot and uploads it', async () => {
    invoiceRepo.findById.mockResolvedValue(closedInvoice());
    await makeWorker().execute({ invoiceId: 'inv-1' });

    expect(pdfGenerator.generate).toHaveBeenCalledWith(
      expect.objectContaining({ invoiceNumberDisplay: 'PINV-000042', lines: SNAPSHOT, currency: 'AUD', totalAmount: 700, inspectorAbn: '12 345 678 901' }),
    );
    expect(storageService.upload).toHaveBeenCalledWith('invoices/insp-1/inv-1.pdf', expect.any(Buffer), 'application/pdf');
    expect(invoiceRepo.update).toHaveBeenCalledWith('inv-1', { fileKey: 'invoices/insp-1/inv-1.pdf' });
  });

  it('reads the frozen snapshot and never re-queries the ledger', async () => {
    invoiceRepo.findById.mockResolvedValue(closedInvoice());
    await makeWorker().execute({ invoiceId: 'inv-1' });
    // The worker has no financial-entry repo dependency at all — the snapshot is the only source.
    const passed = pdfGenerator.generate.mock.calls[0][0];
    expect(passed.lines).toBe(SNAPSHOT);
  });

  it('is idempotent — skips when a file already exists', async () => {
    invoiceRepo.findById.mockResolvedValue(closedInvoice({ fileKey: 'invoices/insp-1/inv-1.pdf' }));
    await makeWorker().execute({ invoiceId: 'inv-1' });
    expect(pdfGenerator.generate).not.toHaveBeenCalled();
    expect(storageService.upload).not.toHaveBeenCalled();
  });

  it('skips when the invoice has no frozen snapshot', async () => {
    invoiceRepo.findById.mockResolvedValue(closedInvoice({ lineItemsSnapshot: null }));
    await makeWorker().execute({ invoiceId: 'inv-1' });
    expect(pdfGenerator.generate).not.toHaveBeenCalled();
  });

  it('skips when the invoice is not found', async () => {
    invoiceRepo.findById.mockResolvedValue(null);
    await makeWorker().execute({ invoiceId: 'missing' });
    expect(pdfGenerator.generate).not.toHaveBeenCalled();
  });
});
