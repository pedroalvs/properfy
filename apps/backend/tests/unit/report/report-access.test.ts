import { describe, it, expect } from 'vitest';
import { assertReportTypeAllowed } from '../../../src/modules/report/application/report-access';
import { ReportForbiddenError } from '../../../src/modules/report/domain/report.errors';
import type { AuthContext, ReportType } from '@properfy/shared';

function auth(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
    clUserPermissions: [],
    ...overrides,
  };
}

describe('assertReportTypeAllowed — INSPECTOR_PROGRAM is operator-only (F08-5, Q18/D8)', () => {
  it.each(['CL_ADMIN', 'CL_USER'] as const)('rejects %s with a type-named message', (role) => {
    expect(() =>
      assertReportTypeAllowed(auth({ role, tenantId: 'tenant-1' }), 'INSPECTOR_PROGRAM' as ReportType),
    ).toThrow(ReportForbiddenError);
    expect(() =>
      assertReportTypeAllowed(auth({ role, tenantId: 'tenant-1' }), 'INSPECTOR_PROGRAM' as ReportType),
    ).toThrow('Agencies cannot generate the INSPECTOR_PROGRAM report');
  });

  it.each(['AM', 'OP'] as const)('is a no-op for %s', (role) => {
    expect(() => assertReportTypeAllowed(auth({ role }), 'INSPECTOR_PROGRAM' as ReportType)).not.toThrow();
  });

  // Regression: the agency allowlist must keep INSPECTOR_PROGRAM out while still
  // admitting the three agency-facing types.
  it('still admits the agency-facing report types for an agency actor', () => {
    for (const reportType of ['APPOINTMENTS', 'FINANCIAL', 'PERFORMANCE'] as const) {
      expect(() =>
        assertReportTypeAllowed(auth({ role: 'CL_ADMIN', tenantId: 'tenant-1' }), reportType as ReportType),
      ).not.toThrow();
    }
  });
});
