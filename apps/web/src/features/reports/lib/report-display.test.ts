import { describe, it, expect } from 'vitest';
import { formatReportFilters } from './report-display';
import type { ReportDetail } from '../types';

function withFilters(filters: unknown): Pick<ReportDetail, 'filters'> {
  return { filters: filters as ReportDetail['filters'] };
}

describe('formatReportFilters (W6 #406)', () => {
  it('renders readable labels, omitting raw-id keys and unknown keys', () => {
    const out = formatReportFilters(
      withFilters({
        tenantId: 'a1b2c3d4-0000-4000-8000-000000000001',
        branchId: 'b1b2c3d4-0000-4000-8000-000000000002',
        fromDate: '2026-01-01',
        toDate: '2026-01-31',
        status: 'SCHEDULED',
        weirdUnknownKey: 'should-not-appear',
      }),
    );

    // No raw UUID and no camelCase key names leak through.
    expect(out).not.toContain('a1b2c3d4-0000-4000-8000-000000000001');
    expect(out).not.toContain('tenantId');
    expect(out).not.toContain('branchId');
    expect(out).not.toContain('weirdUnknownKey');
    // Human labels are present.
    expect(out).toContain('From:');
    expect(out).toContain('To:');
    expect(out).toContain('Status: Scheduled');
  });

  it('formats civil dates without a timezone shift', () => {
    const out = formatReportFilters(withFilters({ fromDate: '2026-03-01', toDate: '2026-03-15' }));
    expect(out).toContain('From: 1 Mar 2026');
    expect(out).toContain('To: 15 Mar 2026');
  });

  it('omits groupProperties:false and returns em-dash when nothing renders', () => {
    expect(formatReportFilters(withFilters({ groupProperties: false }))).toBe('—');
    expect(formatReportFilters(withFilters(null))).toBe('—');
    expect(formatReportFilters(withFilters({ tenantId: 'x-only-a-raw-id' }))).toBe('—');
  });
});
