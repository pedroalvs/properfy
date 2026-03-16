import { describe, it, expect } from 'vitest';
import { FinancialEntryEntity, type FinancialEntryProps } from '../../../src/modules/billing/domain/financial-entry.entity';

function makeFinancialEntry(overrides: Partial<FinancialEntryProps> = {}): FinancialEntryEntity {
  const now = new Date();
  const defaults: FinancialEntryProps = {
    id: 'entry-1',
    tenantId: 'tenant-1',
    appointmentId: 'appt-1',
    inspectorId: 'insp-1',
    entryType: 'TENANT_DEBIT',
    amount: 200,
    currency: 'BRL',
    status: 'PENDING',
    description: 'Tenant debit for routine inspection',
    effectiveAt: now,
    initiatedByUserId: 'user-1',
    approvedByUserId: null,
    approvedAt: null,
    referenceEntryId: null,
    reason: null,
    createdAt: now,
    updatedAt: now,
  };
  return new FinancialEntryEntity({ ...defaults, ...overrides });
}

describe('FinancialEntryEntity', () => {
  it('should create an entity with all props', () => {
    const entry = makeFinancialEntry();

    expect(entry.id).toBe('entry-1');
    expect(entry.tenantId).toBe('tenant-1');
    expect(entry.appointmentId).toBe('appt-1');
    expect(entry.inspectorId).toBe('insp-1');
    expect(entry.entryType).toBe('TENANT_DEBIT');
    expect(entry.amount).toBe(200);
    expect(entry.currency).toBe('BRL');
    expect(entry.status).toBe('PENDING');
    expect(entry.description).toBe('Tenant debit for routine inspection');
    expect(entry.initiatedByUserId).toBe('user-1');
    expect(entry.approvedByUserId).toBeNull();
    expect(entry.approvedAt).toBeNull();
    expect(entry.referenceEntryId).toBeNull();
    expect(entry.reason).toBeNull();
  });

  describe('isPending()', () => {
    it('should return true when status is PENDING', () => {
      const entry = makeFinancialEntry({ status: 'PENDING' });
      expect(entry.isPending()).toBe(true);
    });

    it('should return false when status is APPROVED', () => {
      const entry = makeFinancialEntry({ status: 'APPROVED' });
      expect(entry.isPending()).toBe(false);
    });

    it('should return false when status is CANCELLED', () => {
      const entry = makeFinancialEntry({ status: 'CANCELLED' });
      expect(entry.isPending()).toBe(false);
    });
  });

  describe('isApproved()', () => {
    it('should return true when status is APPROVED', () => {
      const entry = makeFinancialEntry({ status: 'APPROVED' });
      expect(entry.isApproved()).toBe(true);
    });

    it('should return false when status is PENDING', () => {
      const entry = makeFinancialEntry({ status: 'PENDING' });
      expect(entry.isApproved()).toBe(false);
    });

    it('should return false when status is CANCELLED', () => {
      const entry = makeFinancialEntry({ status: 'CANCELLED' });
      expect(entry.isApproved()).toBe(false);
    });
  });

  describe('canBeApproved()', () => {
    it('should return true when status is PENDING', () => {
      const entry = makeFinancialEntry({ status: 'PENDING' });
      expect(entry.canBeApproved()).toBe(true);
    });

    it('should return false when status is APPROVED', () => {
      const entry = makeFinancialEntry({ status: 'APPROVED' });
      expect(entry.canBeApproved()).toBe(false);
    });

    it('should return false when status is CANCELLED', () => {
      const entry = makeFinancialEntry({ status: 'CANCELLED' });
      expect(entry.canBeApproved()).toBe(false);
    });
  });

  describe('isSelfApproval()', () => {
    it('should return true when userId matches initiatedByUserId', () => {
      const entry = makeFinancialEntry({ initiatedByUserId: 'user-1' });
      expect(entry.isSelfApproval('user-1')).toBe(true);
    });

    it('should return false when userId differs from initiatedByUserId', () => {
      const entry = makeFinancialEntry({ initiatedByUserId: 'user-1' });
      expect(entry.isSelfApproval('user-2')).toBe(false);
    });
  });

  it('should allow nullable appointmentId and inspectorId', () => {
    const entry = makeFinancialEntry({
      appointmentId: null,
      inspectorId: null,
      entryType: 'MANUAL_ADJUSTMENT',
    });
    expect(entry.appointmentId).toBeNull();
    expect(entry.inspectorId).toBeNull();
    expect(entry.entryType).toBe('MANUAL_ADJUSTMENT');
  });
});
