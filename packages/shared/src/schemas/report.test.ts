import { describe, it, expect } from 'vitest';
import {
  reportFiltersSchema,
  requestReportSchema,
  listReportsQuerySchema,
} from './report';

const validFilters = {
  fromDate: '2026-01-01',
  toDate: '2026-01-31',
};

const UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('reportFiltersSchema', () => {
  it('should accept valid input with required fields only', () => {
    const result = reportFiltersSchema.safeParse(validFilters);
    expect(result.success).toBe(true);
  });

  it('should default dateAxis to SCHEDULED and groupProperties to false', () => {
    const result = reportFiltersSchema.safeParse(validFilters);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dateAxis).toBe('SCHEDULED');
      expect(result.data.groupProperties).toBe(false);
    }
  });

  it('should accept valid input with all scoped filters', () => {
    const result = reportFiltersSchema.safeParse({
      ...validFilters,
      dateAxis: 'COMPLETED',
      tenantId: UUID,
      branchId: UUID,
      suburb: 'Bondi',
      status: 'DONE',
      groupProperties: true,
    });
    expect(result.success).toBe(true);
  });

  it.each(['SCHEDULED', 'CREATED', 'COMPLETED'])('should accept dateAxis %s', (dateAxis) => {
    const result = reportFiltersSchema.safeParse({ ...validFilters, dateAxis });
    expect(result.success).toBe(true);
  });

  it('should reject an unknown dateAxis', () => {
    const result = reportFiltersSchema.safeParse({ ...validFilters, dateAxis: 'DUE' });
    expect(result.success).toBe(false);
  });

  it.each(['DRAFT', 'AWAITING_INSPECTOR', 'SCHEDULED', 'DONE', 'CANCELLED', 'REJECTED'])(
    'should accept appointment status %s',
    (status) => {
      const result = reportFiltersSchema.safeParse({ ...validFilters, status });
      expect(result.success).toBe(true);
    },
  );

  it('should reject an unknown appointment status', () => {
    const result = reportFiltersSchema.safeParse({ ...validFilters, status: 'PARTIAL' });
    expect(result.success).toBe(false);
  });

  it('should reject a non-uuid branchId', () => {
    const result = reportFiltersSchema.safeParse({ ...validFilters, branchId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('should reject missing fromDate', () => {
    const result = reportFiltersSchema.safeParse({ toDate: '2026-01-31' });
    expect(result.success).toBe(false);
  });

  it('should reject missing toDate', () => {
    const result = reportFiltersSchema.safeParse({ fromDate: '2026-01-01' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid date format', () => {
    const result = reportFiltersSchema.safeParse({
      fromDate: '01-01-2026',
      toDate: '2026-01-31',
    });
    expect(result.success).toBe(false);
  });

  it('should reject an impossible calendar date', () => {
    const result = reportFiltersSchema.safeParse({ fromDate: '2026-02-31', toDate: '2026-03-01' });
    expect(result.success).toBe(false);
  });

  it('should reject toDate < fromDate', () => {
    const result = reportFiltersSchema.safeParse({
      fromDate: '2026-02-01',
      toDate: '2026-01-01',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('toDate');
      expect(result.error.issues[0].message).toBe('toDate must be >= fromDate');
    }
  });

  it('should accept toDate equal to fromDate', () => {
    const result = reportFiltersSchema.safeParse({
      fromDate: '2026-03-15',
      toDate: '2026-03-15',
    });
    expect(result.success).toBe(true);
  });

  it('should reject suburb exceeding 120 characters', () => {
    const result = reportFiltersSchema.safeParse({ ...validFilters, suburb: 'a'.repeat(121) });
    expect(result.success).toBe(false);
  });
});

describe('requestReportSchema', () => {
  it('should accept all 4 report types', () => {
    const types = ['APPOINTMENTS', 'FINANCIAL', 'PERFORMANCE', 'AGENCIES'];
    for (const reportType of types) {
      const result = requestReportSchema.safeParse({ reportType, filters: validFilters });
      expect(result.success).toBe(true);
    }
  });

  it('should reject a removed legacy report type', () => {
    const result = requestReportSchema.safeParse({
      reportType: 'INSPECTIONS_SCHEDULED',
      filters: validFilters,
    });
    expect(result.success).toBe(false);
  });

  it('should reject an unknown report type', () => {
    const result = requestReportSchema.safeParse({ reportType: 'INVALID_TYPE', filters: validFilters });
    expect(result.success).toBe(false);
  });

  it('should not carry a format field (XLSX is implicit)', () => {
    const result = requestReportSchema.safeParse({ reportType: 'APPOINTMENTS', filters: validFilters });
    expect(result.success).toBe(true);
    if (result.success) {
      expect('format' in result.data).toBe(false);
    }
  });

  it('should strip an unknown columns field (column customization removed)', () => {
    // `columns` is no longer part of the contract; the non-strict object simply drops it.
    const result = requestReportSchema.safeParse({
      reportType: 'APPOINTMENTS',
      filters: validFilters,
      columns: ['appointmentId'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect('columns' in result.data).toBe(false);
    }
  });
});

describe('listReportsQuerySchema', () => {
  it('should accept valid input with all fields', () => {
    const result = listReportsQuerySchema.safeParse({
      reportType: 'APPOINTMENTS',
      status: 'READY',
      fromDate: '2026-01-01',
      toDate: '2026-01-31',
      page: 2,
      pageSize: 10,
    });
    expect(result.success).toBe(true);
  });

  it('should accept empty input and apply defaults', () => {
    const result = listReportsQuerySchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.pageSize).toBe(20);
    }
  });

  it('should accept the 4 report types as list filters', () => {
    for (const reportType of ['APPOINTMENTS', 'FINANCIAL', 'PERFORMANCE', 'AGENCIES']) {
      const result = listReportsQuerySchema.safeParse({ reportType });
      expect(result.success).toBe(true);
    }
  });

  it('should reject a removed legacy report type as list filter', () => {
    const result = listReportsQuerySchema.safeParse({ reportType: 'FINANCIAL_SERVICES' });
    expect(result.success).toBe(false);
  });

  it('should reject pageSize greater than 50', () => {
    const result = listReportsQuerySchema.safeParse({ pageSize: 51 });
    expect(result.success).toBe(false);
  });

  it('should reject page less than 1', () => {
    const result = listReportsQuerySchema.safeParse({ page: 0 });
    expect(result.success).toBe(false);
  });

  it('should accept all 4 job statuses', () => {
    for (const status of ['PENDING', 'PROCESSING', 'READY', 'FAILED']) {
      const result = listReportsQuerySchema.safeParse({ status });
      expect(result.success).toBe(true);
    }
  });

  it('should reject invalid status', () => {
    const result = listReportsQuerySchema.safeParse({ status: 'UNKNOWN' });
    expect(result.success).toBe(false);
  });

  it('should coerce string page and pageSize to numbers', () => {
    const result = listReportsQuerySchema.safeParse({ page: '3', pageSize: '15' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(3);
      expect(result.data.pageSize).toBe(15);
    }
  });
});
