import type { UserRole } from '../enums/user';

export interface JwtPayload {
  sub: string;
  tenant_id: string | null;
  role: UserRole;
  branch_id: string | null;
  inspector_id: string | null;
  /** Session id the token was minted for; enables per-session identity/revocation. */
  sid?: string;
  kid: string;
  iat: number;
  exp: number;
  /**
   * Marks a limited-privilege access token issued only so an AM can complete
   * mandatory TOTP enrollment. Present exclusively on the 15-minute setup
   * session; absent on every fully-authenticated token.
   */
  auth_stage?: 'totp_setup';
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
  /**
   * Authentication stage of the current principal. `'totp_setup'` marks a
   * limited session that may reach ONLY the 2FA enrollment endpoints (plus
   * /me and logout); every other route must reject it. Absent on
   * fully-authenticated principals.
   */
  authStage?: 'totp_setup';
  /** Id of the session that minted this token — used to flag the current session and for per-session revocation. */
  sessionId?: string;
  /** CL_USER permission flags from tenant settings. Empty array for non-CL_USER roles. */
  clUserPermissions?: string[];
  /** API-key scopes for machine principals. Absent for JWT (human) principals. */
  scopes?: string[];
}
