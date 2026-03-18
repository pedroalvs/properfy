import { importPKCS8, importSPKI, SignJWT, jwtVerify, decodeProtectedHeader } from 'jose';
import type { AuthContext, UserRole } from '@properfy/shared';
import { UnauthorizedError } from '../../../../shared/domain/errors';

export interface JwtClaims {
  sub: string;
  tenant_id: string | null;
  role: UserRole;
  branch_id: string | null;
  inspector_id: string | null;
}

export interface JwtConfig {
  privateKeyPem: string;
  publicKeyPem: string;
  keyId: string;
  previousPublicKeyPem?: string;
  previousKeyId?: string;
  /** When the previous key expires (default: 30 days from service creation). Tokens signed with the previous key are rejected after this date. */
  previousKeyExpiresAt?: Date;
}

export class JwtService {
  private config: JwtConfig;
  private privateKey?: Awaited<ReturnType<typeof importPKCS8>>;
  private publicKeys: Map<string, Awaited<ReturnType<typeof importSPKI>>> = new Map();
  private initPromise: Promise<void> | null = null;

  constructor(config: JwtConfig) {
    this.config = config;
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
    })
      .setProtectedHeader({ alg: 'RS256', kid: this.config.keyId })
      .setSubject(claims.sub)
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(this.privateKey!);
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

    // Reject tokens signed with the previous key if it has expired
    if (
      targetKid &&
      this.config.previousKeyId &&
      targetKid === this.config.previousKeyId
    ) {
      const expiresAt = this.config.previousKeyExpiresAt
        ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // default 30 days
      if (new Date() > expiresAt) {
        throw new UnauthorizedError('AUTH_UNAUTHORIZED', 'Authentication required');
      }
    }

    try {
      const { payload } = await jwtVerify(token, key, { algorithms: ['RS256'] });
      return {
        userId: payload.sub as string,
        tenantId: (payload['tenant_id'] as string | null) ?? null,
        role: payload['role'] as UserRole,
        branchId: (payload['branch_id'] as string | null) ?? null,
        inspectorId: (payload['inspector_id'] as string | null) ?? null,
      };
    } catch {
      throw new UnauthorizedError('AUTH_UNAUTHORIZED', 'Authentication required');
    }
  }
}
