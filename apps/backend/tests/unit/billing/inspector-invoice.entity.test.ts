import { describe, it, expect } from 'vitest';
import { InspectorInvoiceEntity, type InspectorInvoiceProps } from '../../../src/modules/billing/domain/inspector-invoice.entity';

function makeInvoice(overrides: Partial<InspectorInvoiceProps> = {}): InspectorInvoiceEntity {
  const now = new Date();
  const defaults: InspectorInvoiceProps = {
    id: 'invoice-1',
    invoiceNumber: null,
    inspectorId: 'insp-1',
    periodStart: new Date('2026-03-01'),
    periodEnd: new Date('2026-03-15'),
    periodType: 'FORTNIGHTLY',
    status: 'PENDING_REVIEW',
    totalAmount: 1400,
    currency: 'BRL',
    lineItemsSnapshot: null,
    fileKey: null,
    generatedByUserId: null,
    issuedAt: null,
    paidAt: null,
    paidByUserId: null,
    paymentReference: null,
    notes: null,
    draftedByInspectorId: null,
    createdAt: now,
    updatedAt: now,
  };
  return new InspectorInvoiceEntity({ ...defaults, ...overrides });
}

describe('InspectorInvoiceEntity', () => {
  it('should create an entity with all props', () => {
    const invoice = makeInvoice();

    expect(invoice.id).toBe('invoice-1');
    expect(invoice.inspectorId).toBe('insp-1');
    expect(invoice.periodStart).toEqual(new Date('2026-03-01'));
    expect(invoice.periodEnd).toEqual(new Date('2026-03-15'));
    expect(invoice.periodType).toBe('FORTNIGHTLY');
    expect(invoice.status).toBe('PENDING_REVIEW');
    expect(invoice.totalAmount).toBe(1400);
    expect(invoice.currency).toBe('BRL');
    expect(invoice.fileKey).toBeNull();
    expect(invoice.generatedByUserId).toBeNull();
    expect(invoice.issuedAt).toBeNull();
    expect(invoice.paidAt).toBeNull();
    expect(invoice.notes).toBeNull();
  });

  describe('isClosed()', () => {
    it('should return true when status is CLOSED', () => {
      const invoice = makeInvoice({ status: 'CLOSED' });
      expect(invoice.isClosed()).toBe(true);
    });

    it('should return false when status is PENDING_REVIEW', () => {
      const invoice = makeInvoice({ status: 'PENDING_REVIEW' });
      expect(invoice.isClosed()).toBe(false);
    });

    it('should return false when status is PAID', () => {
      const invoice = makeInvoice({ status: 'PAID' });
      expect(invoice.isClosed()).toBe(false);
    });
  });

  describe('isPaid()', () => {
    it('should return true when status is PAID', () => {
      const invoice = makeInvoice({ status: 'PAID' });
      expect(invoice.isPaid()).toBe(true);
    });

    it('should return false when status is PENDING_REVIEW', () => {
      const invoice = makeInvoice({ status: 'PENDING_REVIEW' });
      expect(invoice.isPaid()).toBe(false);
    });

    it('should return false when status is CLOSED', () => {
      const invoice = makeInvoice({ status: 'CLOSED' });
      expect(invoice.isPaid()).toBe(false);
    });
  });

  describe('isReady()', () => {
    it('should return true when status is CLOSED', () => {
      const invoice = makeInvoice({ status: 'CLOSED' });
      expect(invoice.isReady()).toBe(true);
    });

    it('should return true when status is PAID', () => {
      const invoice = makeInvoice({ status: 'PAID' });
      expect(invoice.isReady()).toBe(true);
    });

    it('should return false when status is PENDING_REVIEW', () => {
      const invoice = makeInvoice({ status: 'PENDING_REVIEW' });
      expect(invoice.isReady()).toBe(false);
    });
  });

  describe('hasFile()', () => {
    it('should return true when fileKey is set', () => {
      const invoice = makeInvoice({ fileKey: 'invoices/insp-1/2026-03.pdf' });
      expect(invoice.hasFile()).toBe(true);
    });

    it('should return false when fileKey is null', () => {
      const invoice = makeInvoice({ fileKey: null });
      expect(invoice.hasFile()).toBe(false);
    });
  });

  it('should support all period types', () => {
    const weekly = makeInvoice({ periodType: 'WEEKLY' });
    expect(weekly.periodType).toBe('WEEKLY');

    const fortnightly = makeInvoice({ periodType: 'FORTNIGHTLY' });
    expect(fortnightly.periodType).toBe('FORTNIGHTLY');

    const monthly = makeInvoice({ periodType: 'MONTHLY' });
    expect(monthly.periodType).toBe('MONTHLY');
  });

  describe('isVoid()', () => {
    it('should return true when status is VOID', () => {
      expect(makeInvoice({ status: 'VOID' }).isVoid()).toBe(true);
    });
    it('should return false otherwise', () => {
      expect(makeInvoice({ status: 'PENDING_REVIEW' }).isVoid()).toBe(false);
    });
  });

  describe('isActive()', () => {
    it.each(['PENDING_REVIEW', 'CLOSED', 'PAID'] as const)('is active for %s', (status) => {
      expect(makeInvoice({ status }).isActive()).toBe(true);
    });
    it.each(['VOID'] as const)('is not active for %s', (status) => {
      expect(makeInvoice({ status }).isActive()).toBe(false);
    });
  });

  describe('assignNumberAndFreeze()', () => {
    const snapshot = [
      {
        serviceDate: '2026-03-02',
        appointmentId: 'a1',
        appointmentCode: 'ABC-0001',
        propertyAddress: '1 Test St',
        serviceType: 'Routine',
        amount: 700,
        agencyId: 'ag1',
        agencyName: 'Agency One',
        branchId: 'b1',
        branchName: 'Branch One',
      },
    ];

    it('freezes snapshot/total/name/number and transitions PENDING_REVIEW → CLOSED', () => {
      const invoice = makeInvoice({ status: 'PENDING_REVIEW', totalAmount: 0 });
      const issuedAt = new Date('2026-03-16T00:00:00Z');
      invoice.assignNumberAndFreeze({
        invoiceNumber: 42,
        lineItemsSnapshot: snapshot,
        totalAmount: 700,
        inspectorName: 'Jane Inspector',
        issuedAt,
        generatedByUserId: 'op-1',
      });
      expect(invoice.status).toBe('CLOSED');
      expect(invoice.invoiceNumber).toBe(42);
      expect(invoice.totalAmount).toBe(700);
      expect(invoice.inspectorName).toBe('Jane Inspector');
      expect(invoice.issuedAt).toBe(issuedAt);
      expect(invoice.generatedByUserId).toBe('op-1');
      expect(invoice.lineItemsSnapshot).toEqual(snapshot);
    });

    it('throws when the invoice is not PENDING_REVIEW', () => {
      const invoice = makeInvoice({ status: 'CLOSED' });
      expect(() =>
        invoice.assignNumberAndFreeze({
          invoiceNumber: 1,
          lineItemsSnapshot: snapshot,
          totalAmount: 700,
          inspectorName: null,
          issuedAt: new Date(),
          generatedByUserId: 'op-1',
        }),
      ).toThrow();
    });
  });

  describe('void()', () => {
    it('transitions PENDING_REVIEW → VOID and stores the reason', () => {
      const invoice = makeInvoice({ status: 'PENDING_REVIEW' });
      invoice.void('Payouts do not belong to this period');
      expect(invoice.status).toBe('VOID');
      expect(invoice.notes).toBe('Payouts do not belong to this period');
    });

    it('throws when the invoice is not PENDING_REVIEW', () => {
      const invoice = makeInvoice({ status: 'CLOSED' });
      expect(() => invoice.void('reason')).toThrow();
    });
  });
});
