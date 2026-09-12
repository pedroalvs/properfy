import { importPKCS8, importSPKI, SignJWT, jwtVerify, decodeProtectedHeader } from 'jose';
import type { AuthContext, UserRole } from '@properfy/shared';
import { UnauthorizedError } from '../../../../shared/domain/errors';

export interface JwtClaims {
  sub: string;
  tenant_id: string | null;
  role: UserRole;
  branch_id: string | null;
  inspector_id: string | null;
  /**
   * Limited-privilege marker for the AM TOTP-enrollment session. When set, the
   * auth middleware rejects the token on every route except the 2FA setup
   * endpoints, /me and logout. Omitted on normal, fully-authenticated tokens.
   */
  auth_stage?: 'totp_setup';
}

export interface JwtConfig {
  privateKeyPem: string;
  publicKeyPem: string;
  keyId: string;
  /** Access token TTL in minutes (default: 60) */
  accessTokenTtlMinutes?: number;
  previousPublicKeyPem?: string;
  previousKeyId?: string;
  /** When the previous key expires (default: 30 days from service creation). Tokens signed with the previous key are rejected after this date. */
  previousKeyExpiresAt?: Date;
  /** Expected `iss` claim. Default: 'properfy-api'. */
  issuer?: string;
  /** Expected `aud` claim. Default: 'properfy'. */
  audience?: string;
}

const DEFAULT_ISSUER = 'properfy-api';
const DEFAULT_AUDIENCE = 'properfy';
const PREVIOUS_KEY_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

export class JwtService {
  private config: JwtConfig;
  private readonly issuer: string;
  private readonly audience: string;
  private privateKey?: Awaited<ReturnType<typeof importPKCS8>>;
  private publicKeys: Map<string, Awaited<ReturnType<typeof importSPKI>>> = new Map();
  private initPromise: Promise<void> | null = null;

  constructor(config: JwtConfig) {
    this.config = config;
    this.issuer = config.issuer ?? DEFAULT_ISSUER;
    this.audience = config.audience ?? DEFAULT_AUDIENCE;
    // #254: freeze the previous-key grace deadline ONCE, at construction, so it
    // no longer slides forward on every verify() call (which effectively never
    // expired the old key). Only meaningful when a previous key is configured.
    if (
      this.config.previousKeyId &&
      this.config.previousPublicKeyPem &&
      !this.config.previousKeyExpiresAt
    ) {
      this.config.previousKeyExpiresAt = new Date(Date.now() + PREVIOUS_KEY_GRACE_MS);
    }
  }

  private init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this._doInit();
    }
    return this.initPromise;
  }

  private async _doInit(): Promise<void> {
    this.privateKey = await importPKCS8(this.config.privateKeyPem, 'RS256');
    const pubKey = await importSPKI(this.config.publicKeyPem, 'RS256');
    this.publicKeys.set(this.config.keyId, pubKey);
    if (this.config.previousPublicKeyPem && this.config.previousKeyId) {
      const prevKey = await importSPKI(this.config.previousPublicKeyPem, 'RS256');
      this.publicKeys.set(this.config.previousKeyId, prevKey);
    }
  }

  async signAccessToken(claims: JwtClaims): Promise<string> {
    await this.init();
    return new SignJWT({
      tenant_id: claims.tenant_id,
      role: claims.role,
      branch_id: claims.branch_id,
      inspector_id: claims.inspector_id,
      ...(claims.auth_stage ? { auth_stage: claims.auth_stage } : {}),
    })
      .setProtectedHeader({ alg: 'RS256', kid: this.config.keyId })
      .setSubject(claims.sub)
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setIssuedAt()
      .setExpirationTime(`${this.config.accessTokenTtlMinutes ?? 60}m`)
      .sign(this.privateKey!);
  }

  getPreviousKeyDaysRemaining(): number | null {
    if (!this.config.previousKeyExpiresAt) return null;
    const msRemaining = this.config.previousKeyExpiresAt.getTime() - Date.now();
    return Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)));
  }

  async verify(token: string): Promise<AuthContext> {
    await this.init();
    // Decode header first to find the correct key by kid
    let targetKid: string | undefined;
    try {
      const header = decodeProtectedHeader(token);
      targetKid = header.kid;
    } catch {
      throw new UnauthorizedError('AUTH_UNAUTHORIZED', 'Authentication required');
    }

    const key = targetKid ? this.publicKeys.get(targetKid) : undefined;
    if (!key) {
      throw new UnauthorizedError('AUTH_UNAUTHORIZED', 'Authentication required');
    }

    // Reject tokens signed with the previous key once its (fixed) grace
    // deadline has passed. The deadline was frozen at construction (#254), so
    // it no longer slides forward on each call.
    if (
      targetKid &&
      this.config.previousKeyId &&
      targetKid === this.config.previousKeyId
    ) {
      const expiresAt = this.config.previousKeyExpiresAt;
      if (expiresAt && new Date() > expiresAt) {
        throw new UnauthorizedError('AUTH_UNAUTHORIZED', 'Authentication required');
      }
    }

    try {
      const { payload } = await jwtVerify(token, key, {
        algorithms: ['RS256'],
        issuer: this.issuer,
        audience: this.audience,
      });
      const authStage = payload['auth_stage'] === 'totp_setup' ? ('totp_setup' as const) : undefined;
      return {
        userId: payload.sub as string,
        tenantId: (payload['tenant_id'] as string | null) ?? null,
        role: payload['role'] as UserRole,
        branchId: (payload['branch_id'] as string | null) ?? null,
        inspectorId: (payload['inspector_id'] as string | null) ?? null,
        ...(authStage ? { authStage } : {}),
        clUserPermissions: [],
      };
    } catch {
      throw new UnauthorizedError('AUTH_UNAUTHORIZED', 'Authentication required');
    }
  }
}
