import type { AuthContext, ReportType } from '@properfy/shared';
import type { ReportEntity } from '../domain/report.entity';
import { ReportForbiddenError, ReportTenantScopeViolationError } from '../domain/report.errors';

/** Roles admitted on any report surface. Also consumed by the route-layer guard. */
export const REPORT_ROLES = ['AM', 'OP', 'CL_ADMIN', 'CL_USER'] as const;

/** Roles that read the whole platform and may target any agency (or none). */
const OPERATOR_ROLES = ['AM', 'OP'] as const;

/**
 * Report types an agency may generate. `AGENCIES` compares agencies against one
 * another, so it is meaningless — and disclosive — when scoped to a single one.
 */
const AGENCY_REPORT_TYPES: ReportType[] = ['APPOINTMENTS', 'FINANCIAL', 'PERFORMANCE'];

function isOperator(auth: AuthContext): boolean {
  return (OPERATOR_ROLES as readonly string[]).includes(auth.role);
}

/** True for the agency (tenant-scoped) cohort — CL_ADMIN and CL_USER. */
export function isAgencyActor(auth: AuthContext): boolean {
  return auth.role === 'CL_ADMIN' || auth.role === 'CL_USER';
}

/** Gate every report surface. The CL_USER `view_financials` flag is enforced at the route layer. */
export function assertReportRole(auth: AuthContext): void {
  if (!(REPORT_ROLES as readonly string[]).includes(auth.role)) {
    throw new ReportForbiddenError();
  }
}

/** Reject report types an agency actor may not generate. No-op for operators. */
export function assertReportTypeAllowed(auth: AuthContext, reportType: ReportType): void {
  if (isAgencyActor(auth) && !AGENCY_REPORT_TYPES.includes(reportType)) {
    throw new ReportForbiddenError(`Agencies cannot generate the ${reportType} report`);
  }
}

/**
 * Resolve the agency scope to freeze onto the report.
 *
 * Operators may target one agency or run cross-agency (`null`). Agency actors are
 * pinned to their own tenant and any requested `tenantId` is ignored rather than
 * trusted — matching `resolveTenantScope` in the property module.
 *
 * Fails closed when an agency actor has no tenant: the data reader treats a falsy
 * `tenantId` as "apply no filter", which would silently produce a platform-wide
 * export. Nothing downstream re-checks this — the worker never sees an auth
 * context — so this is the last place the invariant can be enforced.
 */
export function resolveReportTenantScope(auth: AuthContext, requestedTenantId?: string): string | null {
  if (isOperator(auth)) {
    return requestedTenantId ?? null;
  }
  if (isAgencyActor(auth)) {
    if (!auth.tenantId) {
      throw new ReportTenantScopeViolationError();
    }
    return auth.tenantId;
  }
  throw new ReportForbiddenError();
}

/**
 * Gate reading an existing report (status / download).
 *
 * An agency may only reach its own agency-scoped runs. The `agencyScoped` half is
 * essential: an operator-run report targeting the same agency carries an identical
 * `tenant_id` but may contain platform-only data (inspector payouts, margin).
 */
export function assertReportReadable(auth: AuthContext, report: ReportEntity): void {
  if (!isAgencyActor(auth)) return;
  if (!report.agencyScoped || !auth.tenantId || report.tenantId !== auth.tenantId) {
    throw new ReportTenantScopeViolationError();
  }
}
