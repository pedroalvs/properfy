import { describe, it, expect } from 'vitest';
import { InspectorInvoiceEntity, type InspectorInvoiceProps } from '../../../src/modules/billing/domain/inspector-invoice.entity';

function makeInvoice(overrides: Partial<InspectorInvoiceProps> = {}): InspectorInvoiceEntity {
  const now = new Date();
  const defaults: InspectorInvoiceProps = {
    id: 'invoice-1',
    inspectorId: 'insp-1',
    periodStart: new Date('2026-03-01'),
    periodEnd: new Date('2026-03-15'),
    periodType: 'BIWEEKLY',
    status: 'OPEN',
    totalAmount: 1400,
    currency: 'BRL',
    fileKey: null,
    generatedByUserId: null,
    generatedAt: null,
    paidAt: null,
    notes: null,
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
    expect(invoice.periodType).toBe('BIWEEKLY');
    expect(invoice.status).toBe('OPEN');
    expect(invoice.totalAmount).toBe(1400);
    expect(invoice.currency).toBe('BRL');
    expect(invoice.fileKey).toBeNull();
    expect(invoice.generatedByUserId).toBeNull();
    expect(invoice.generatedAt).toBeNull();
    expect(invoice.paidAt).toBeNull();
    expect(invoice.notes).toBeNull();
  });

  describe('isClosed()', () => {
    it('should return true when status is CLOSED', () => {
      const invoice = makeInvoice({ status: 'CLOSED' });
      expect(invoice.isClosed()).toBe(true);
    });

    it('should return false when status is OPEN', () => {
      const invoice = makeInvoice({ status: 'OPEN' });
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

    it('should return false when status is OPEN', () => {
      const invoice = makeInvoice({ status: 'OPEN' });
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

    it('should return false when status is OPEN', () => {
      const invoice = makeInvoice({ status: 'OPEN' });
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

    const biweekly = makeInvoice({ periodType: 'BIWEEKLY' });
    expect(biweekly.periodType).toBe('BIWEEKLY');

    const monthly = makeInvoice({ periodType: 'MONTHLY' });
    expect(monthly.periodType).toBe('MONTHLY');
  });
});
