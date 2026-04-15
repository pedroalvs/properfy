import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthContext } from '@properfy/shared';
import { UnauthorizedError } from '../domain/errors';

// This module sets up the auth middleware. The actual JWT verification
// is handled by JwtService (injected via the app container). This file
// provides the Fastify preHandler hook factory.

export type JwtVerifier = (token: string) => Promise<AuthContext>;
export type TenantActiveChecker = (tenantId: string) => Promise<boolean>;
export type ClUserPermissionsResolver = (tenantId: string) => Promise<string[]>;

export function createAuthMiddleware(
  verifyJwt: JwtVerifier,
  checkTenantActive?: TenantActiveChecker,
  resolveClUserPermissions?: ClUserPermissionsResolver,
) {
  return async function authenticate(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    const authHeader = request.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedError('AUTH_UNAUTHORIZED', 'Authentication required');
    }
    const token = authHeader.slice(7);
    const ctx = await verifyJwt(token);

    // Sprint 1 W-4-IMPL (CORRECTION-001 close-it, 2026-04-13):
    // OP is now a tenant-scoped role. A JWT claiming `role: OP` with
    // `tenantId: null` is an invalid auth state and must be rejected.
    // AM remains the only tenant-free role.
    if (ctx.role === 'OP' && !ctx.tenantId) {
      throw new UnauthorizedError(
        'AUTH_UNAUTHORIZED',
        'OP tokens must carry a tenant scope',
      );
    }

    // Check tenant status for client roles and resolve CL_USER permissions
    if (ctx.tenantId && (ctx.role === 'CL_ADMIN' || ctx.role === 'CL_USER')) {
      if (checkTenantActive) {
        const isActive = await checkTenantActive(ctx.tenantId);
        if (!isActive) {
          throw new UnauthorizedError('AUTH_TENANT_INACTIVE', 'Tenant account is not active');
        }
      }

      if (ctx.role === 'CL_USER' && resolveClUserPermissions) {
        ctx.clUserPermissions = await resolveClUserPermissions(ctx.tenantId);
      }
    }

    request.authContext = ctx;
  };
}

// Extend Fastify request type
declare module 'fastify' {
  interface FastifyRequest {
    authContext?: AuthContext;
  }
}
