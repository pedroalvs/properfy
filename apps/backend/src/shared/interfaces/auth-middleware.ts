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

    // OP is cross-tenant per CLAUDE.md §6 ("Operator, cross-tenant,
    // operational team"). Tokens issued for OP users legitimately carry
    // `tenantId: null`, and use cases handle OP the same way they handle AM
    // at the repository layer (nullable tenant filter = platform-wide).
    //
    // QA regression 2026-04-19: the guard previously added here
    // ("OP tokens must carry a tenant scope") broke every OP request, since
    // nothing in the provisioning flow assigns a tenant_id to OP users.
    // Removing the guard restores the documented role contract.

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
