import { describe, it, expect } from 'vitest';
import {
  listFinancialEntriesQuerySchema,
  createManualAdjustmentSchema,
  createRefundSchema,
  listInvoicesQuerySchema,
  invoiceSummaryQuerySchema,
  invoiceSummaryResponseSchema,
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

describe('listInvoicesQuerySchema', () => {
  it('should accept empty object with defaults', () => {
    const result = listInvoicesQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
    }
  });

  it('should accept a 3-bucket status plus agency/branch content filters', () => {
    const result = listInvoicesQuerySchema.safeParse({
      status: 'approved',
      inspectorId: '550e8400-e29b-41d4-a716-446655440000',
      agencyId: '550e8400-e29b-41d4-a716-446655440001',
      branchId: '550e8400-e29b-41d4-a716-446655440002',
    });
    expect(result.success).toBe(true);
  });

  it('should accept each status bucket', () => {
    for (const status of ['pending', 'approved', 'rejected', 'done']) {
      expect(listInvoicesQuerySchema.safeParse({ status }).success).toBe(true);
    }
  });

  it('should reject a raw persisted status (buckets only)', () => {
    expect(listInvoicesQuerySchema.safeParse({ status: 'CLOSED' }).success).toBe(false);
  });

  it('should reject invalid status enum', () => {
    const result = listInvoicesQuerySchema.safeParse({
      status: 'INVALID',
    });
    expect(result.success).toBe(false);
  });
});

describe('invoiceSummaryQuerySchema', () => {
  it('should accept an empty object (all filters optional)', () => {
    expect(invoiceSummaryQuerySchema.safeParse({}).success).toBe(true);
  });

  it('should accept all filters together', () => {
    const result = invoiceSummaryQuerySchema.safeParse({
      inspectorId: '550e8400-e29b-41d4-a716-446655440000',
      agencyId: '550e8400-e29b-41d4-a716-446655440001',
      branchId: '550e8400-e29b-41d4-a716-446655440002',
      fromDate: '2026-01-01',
      toDate: '2026-12-31',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid date format', () => {
    expect(invoiceSummaryQuerySchema.safeParse({ fromDate: '01/01/2026' }).success).toBe(false);
  });

  it('should reject toDate before fromDate', () => {
    const result = invoiceSummaryQuerySchema.safeParse({
      fromDate: '2026-06-30',
      toDate: '2026-06-01',
    });
    expect(result.success).toBe(false);
  });

  it('should reject non-uuid inspectorId', () => {
    expect(invoiceSummaryQuerySchema.safeParse({ inspectorId: 'abc' }).success).toBe(false);
  });
});

describe('invoiceSummaryResponseSchema', () => {
  it('should accept a valid summary payload', () => {
    const result = invoiceSummaryResponseSchema.safeParse({
      currency: 'AUD',
      totalCount: 10,
      pendingCount: 4,
      approvedCount: 3,
      paidCount: 2,
      voidCount: 1,
      pendingAmount: 1200.5,
      paidAmount: 800,
    });
    expect(result.success).toBe(true);
  });

  it('should reject negative counts', () => {
    const result = invoiceSummaryResponseSchema.safeParse({
      currency: 'AUD',
      totalCount: -1,
      pendingCount: 0,
      approvedCount: 0,
      paidCount: 0,
      voidCount: 0,
      pendingAmount: 0,
      paidAmount: 0,
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing currency', () => {
    const result = invoiceSummaryResponseSchema.safeParse({
      totalCount: 0,
      pendingCount: 0,
      approvedCount: 0,
      paidCount: 0,
      voidCount: 0,
      pendingAmount: 0,
      paidAmount: 0,
    });
    expect(result.success).toBe(false);
  });
});
