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

describe('reportFiltersSchema', () => {
  it('should accept valid input with required fields only', () => {
    const result = reportFiltersSchema.safeParse(validFilters);
    expect(result.success).toBe(true);
  });

  it('should accept valid input with all optional fields', () => {
    const result = reportFiltersSchema.safeParse({
      ...validFilters,
      tenantId: '550e8400-e29b-41d4-a716-446655440000',
      serviceTypeId: '550e8400-e29b-41d4-a716-446655440001',
      branchId: '550e8400-e29b-41d4-a716-446655440002',
      inspectorId: '550e8400-e29b-41d4-a716-446655440003',
      status: 'DONE',
      tenantConfirmationStatus: 'CONFIRMED',
      search: 'some search',
      emailNotificationStatus: 'SENT',
    });
    expect(result.success).toBe(true);
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

  it('should reject search exceeding 200 characters', () => {
    const result = reportFiltersSchema.safeParse({
      ...validFilters,
      search: 'a'.repeat(201),
    });
    expect(result.success).toBe(false);
  });

  it('should accept search with exactly 200 characters', () => {
    const result = reportFiltersSchema.safeParse({
      ...validFilters,
      search: 'a'.repeat(200),
    });
    expect(result.success).toBe(true);
  });
});

describe('requestReportSchema', () => {
  it('should accept valid input', () => {
    const result = requestReportSchema.safeParse({
      reportType: 'INSPECTIONS_SCHEDULED',
      filters: validFilters,
      format: 'XLSX',
    });
    expect(result.success).toBe(true);
  });

  it('should accept all 7 report types', () => {
    const types = [
      'INSPECTIONS_SCHEDULED',
      'INSPECTIONS_DONE',
      'INSPECTIONS_CANCELLED',
      'INSPECTIONS_REJECTED',
      'INSPECTOR_PERFORMANCE',
      'CONFIRMATION_STATUS',
      'FINANCIAL_SERVICES',
    ];
    for (const reportType of types) {
      const result = requestReportSchema.safeParse({
        reportType,
        filters: validFilters,
      });
      expect(result.success).toBe(true);
    }
  });

  it('should default format to XLSX when omitted', () => {
    const result = requestReportSchema.safeParse({
      reportType: 'INSPECTIONS_DONE',
      filters: validFilters,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.format).toBe('XLSX');
    }
  });

  it('should reject invalid report type', () => {
    const result = requestReportSchema.safeParse({
      reportType: 'INVALID_TYPE',
      filters: validFilters,
    });
    expect(result.success).toBe(false);
  });

  it('should accept CSV format', () => {
    const result = requestReportSchema.safeParse({
      reportType: 'INSPECTIONS_DONE',
      filters: validFilters,
      format: 'CSV',
    });
    expect(result.success).toBe(true);
  });

  it('should accept PDF format', () => {
    const result = requestReportSchema.safeParse({
      reportType: 'INSPECTIONS_DONE',
      filters: validFilters,
      format: 'PDF',
    });
    expect(result.success).toBe(true);
  });

  it('should reject invalid format', () => {
    const result = requestReportSchema.safeParse({
      reportType: 'INSPECTIONS_DONE',
      filters: validFilters,
      format: 'DOCX',
    });
    expect(result.success).toBe(false);
  });

  it('should accept optional columns array', () => {
    const result = requestReportSchema.safeParse({
      reportType: 'INSPECTIONS_DONE',
      filters: validFilters,
      columns: ['appointmentId', 'status'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.columns).toEqual(['appointmentId', 'status']);
    }
  });

  it('should accept request without columns', () => {
    const result = requestReportSchema.safeParse({
      reportType: 'INSPECTIONS_DONE',
      filters: validFilters,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.columns).toBeUndefined();
    }
  });

  it('should reject empty columns array', () => {
    const result = requestReportSchema.safeParse({
      reportType: 'INSPECTIONS_DONE',
      filters: validFilters,
      columns: [],
    });
    expect(result.success).toBe(false);
  });

  it('should reject columns with empty string entries', () => {
    const result = requestReportSchema.safeParse({
      reportType: 'INSPECTIONS_DONE',
      filters: validFilters,
      columns: [''],
    });
    expect(result.success).toBe(false);
  });

  it('should reject columns array exceeding 50 entries', () => {
    const result = requestReportSchema.safeParse({
      reportType: 'INSPECTIONS_DONE',
      filters: validFilters,
      columns: Array.from({ length: 51 }, (_, i) => `col${i}`),
    });
    expect(result.success).toBe(false);
  });
});

describe('listReportsQuerySchema', () => {
  it('should accept valid input with all fields', () => {
    const result = listReportsQuerySchema.safeParse({
      reportType: 'INSPECTIONS_DONE',
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

  it('should default page to 1', () => {
    const result = listReportsQuerySchema.safeParse({ pageSize: 10 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
    }
  });

  it('should default pageSize to 20', () => {
    const result = listReportsQuerySchema.safeParse({ page: 1 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.pageSize).toBe(20);
    }
  });

  it('should reject pageSize greater than 50', () => {
    const result = listReportsQuerySchema.safeParse({ pageSize: 51 });
    expect(result.success).toBe(false);
  });

  it('should reject page less than 1', () => {
    const result = listReportsQuerySchema.safeParse({ page: 0 });
    expect(result.success).toBe(false);
  });

  it('should accept all optional filters', () => {
    const result = listReportsQuerySchema.safeParse({
      reportType: 'FINANCIAL_SERVICES',
      status: 'PENDING',
      fromDate: '2026-01-01',
      toDate: '2026-12-31',
    });
    expect(result.success).toBe(true);
  });

  it('should accept all 4 report statuses', () => {
    const statuses = ['PENDING', 'PROCESSING', 'READY', 'FAILED'];
    for (const status of statuses) {
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
