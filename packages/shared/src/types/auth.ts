import type { UserRole } from '../enums/user';

export interface JwtPayload {
  sub: string;
  tenant_id: string | null;
  role: UserRole;
  branch_id: string | null;
  inspector_id: string | null;
  kid: string;
  iat: number;
  exp: number;
}

export interface AuthContext {
  userId: string;
  tenantId: string | null;
  role: UserRole;
  branchId: string | null;
  inspectorId: string | null;
  /**
   * Effective IANA timezone for this principal, resolved per request (never a
   * JWT claim, so agency/user changes apply immediately): agency timezone for
   * CL_* roles, personal users.timezone for AM/OP/INSP, platform default
   * otherwise. Optional because token verification alone cannot resolve it;
   * the auth middleware fills it before handlers run.
   */
  timezone?: string;
  /** CL_USER permission flags from tenant settings. Empty array for non-CL_USER roles. */
  clUserPermissions?: string[];
  /** API-key scopes for machine principals. Absent for JWT (human) principals. */
  scopes?: string[];
}
