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
  /** CL_USER permission flags from tenant settings. Empty array for non-CL_USER roles. */
  clUserPermissions?: string[];
}
