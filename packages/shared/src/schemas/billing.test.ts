import { describe, it, expect } from 'vitest';
import {
  listFinancialEntriesQuerySchema,
  createManualAdjustmentSchema,
  createRefundSchema,
  generateInvoiceSchema,
  listInvoicesQuerySchema,
} from './billing';

describe('listFinancialEntriesQuerySchema', () => {
  it('should accept empty object with defaults', () => {
    const result = listFinancialEntriesQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
      expect(result.data.sortBy).toBe('effectiveAt');
      expect(result.data.sortOrder).toBe('desc');
    }
  });

  it('should accept valid input with all fields', () => {
    const result = listFinancialEntriesQuerySchema.safeParse({
      type: 'TENANT_DEBIT',
      status: 'PENDING',
      inspectorId: '550e8400-e29b-41d4-a716-446655440000',
      tenantId: '550e8400-e29b-41d4-a716-446655440001',
      fromDate: '2026-01-01',
      toDate: '2026-12-31',
      page: 2,
      pageSize: 50,
      sortBy: 'amount',
      sortOrder: 'asc',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid date format', () => {
    const result = listFinancialEntriesQuerySchema.safeParse({
      fromDate: '01-01-2026',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid type enum', () => {
    const result = listFinancialEntriesQuerySchema.safeParse({
      type: 'INVALID_TYPE',
    });
    expect(result.success).toBe(false);
  });
});

describe('createManualAdjustmentSchema', () => {
  it('should accept valid full input', () => {
    const result = createManualAdjustmentSchema.safeParse({
      tenantId: '550e8400-e29b-41d4-a716-446655440000',
      appointmentId: '550e8400-e29b-41d4-a716-446655440001',
      inspectorId: '550e8400-e29b-41d4-a716-446655440002',
      amount: 150.50,
      description: 'Manual adjustment for missed inspection',
      reason: 'Inspector was not available',
      effectiveAt: '2026-03-16T10:00:00.000Z',
      referenceEntryId: '550e8400-e29b-41d4-a716-446655440003',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty reason', () => {
    const result = createManualAdjustmentSchema.safeParse({
      tenantId: '550e8400-e29b-41d4-a716-446655440000',
      amount: 100,
      description: 'Some description',
      reason: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject non-positive amount', () => {
    const result = createManualAdjustmentSchema.safeParse({
      tenantId: '550e8400-e29b-41d4-a716-446655440000',
      amount: -50,
      description: 'Some description',
      reason: 'Some reason',
    });
    expect(result.success).toBe(false);
  });

  it('should reject amount equal to zero', () => {
    const result = createManualAdjustmentSchema.safeParse({
      tenantId: '550e8400-e29b-41d4-a716-446655440000',
      amount: 0,
      description: 'Some description',
      reason: 'Some reason',
    });
    expect(result.success).toBe(false);
  });
});

describe('createRefundSchema', () => {
  it('should accept valid input', () => {
    const result = createRefundSchema.safeParse({
      description: 'Refund for cancelled inspection',
      reason: 'Service was marked as done but not executed',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty reason', () => {
    const result = createRefundSchema.safeParse({
      description: 'Some description',
      reason: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject empty description', () => {
    const result = createRefundSchema.safeParse({
      description: '',
      reason: 'Some reason',
    });
    expect(result.success).toBe(false);
  });
});

describe('generateInvoiceSchema', () => {
  it('should accept valid input', () => {
    const result = generateInvoiceSchema.safeParse({
      inspectorId: '550e8400-e29b-41d4-a716-446655440000',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-15',
      periodType: 'MONTHLY',
    });
    expect(result.success).toBe(true);
  });

  it('should reject periodEnd before periodStart', () => {
    const result = generateInvoiceSchema.safeParse({
      inspectorId: '550e8400-e29b-41d4-a716-446655440000',
      periodStart: '2026-03-15',
      periodEnd: '2026-03-01',
    });
    expect(result.success).toBe(false);
  });

  it('should reject invalid date format', () => {
    const result = generateInvoiceSchema.safeParse({
      inspectorId: '550e8400-e29b-41d4-a716-446655440000',
      periodStart: '03-01-2026',
      periodEnd: '03-15-2026',
    });
    expect(result.success).toBe(false);
  });
});

describe('listInvoicesQuerySchema', () => {
  it('should accept empty object with defaults', () => {
    const result = listInvoicesQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
    }
  });

  it('should accept valid input with status', () => {
    const result = listInvoicesQuerySchema.safeParse({
      status: 'OPEN',
      inspectorId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid status enum', () => {
    const result = listInvoicesQuerySchema.safeParse({
      status: 'INVALID',
    });
    expect(result.success).toBe(false);
  });
});
