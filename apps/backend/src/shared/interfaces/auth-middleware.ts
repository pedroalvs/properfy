import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthContext } from '@properfy/shared';
import { UnauthorizedError } from '../domain/errors';

// This module sets up the auth middleware. The actual JWT verification
// is handled by JwtService (injected via the app container). This file
// provides the Fastify preHandler hook factory.

export type JwtVerifier = (token: string) => Promise<AuthContext>;
export type TenantActiveChecker = (tenantId: string) => Promise<boolean>;

export function createAuthMiddleware(
  verifyJwt: JwtVerifier,
  checkTenantActive?: TenantActiveChecker,
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

    // Check tenant status for client roles
    if (checkTenantActive && ctx.tenantId && (ctx.role === 'CL_ADMIN' || ctx.role === 'CL_USER')) {
      const isActive = await checkTenantActive(ctx.tenantId);
      if (!isActive) {
        throw new UnauthorizedError('AUTH_TENANT_INACTIVE', 'Tenant account is not active');
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
