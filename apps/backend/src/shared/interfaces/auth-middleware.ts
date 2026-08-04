import type { FastifyReply, FastifyRequest } from 'fastify';
import { PLATFORM_TIMEZONE, type AuthContext } from '@properfy/shared';
import { UnauthorizedError } from '../domain/errors';

// This module sets up the auth middleware. The actual JWT verification
// is handled by JwtService (injected via the app container). This file
// provides the Fastify preHandler hook factory.

export type JwtVerifier = (token: string) => Promise<AuthContext>;
export type TenantActiveChecker = (tenantId: string) => Promise<boolean>;
export type ClUserPermissionsResolver = (tenantId: string) => Promise<string[]>;
export type EffectiveTimezoneResolver = (ctx: AuthContext) => Promise<string>;

// Composition-root default: route modules construct their own middleware
// instances (23 sites), so the resolver is registered once at boot instead of
// being threaded through every route container. An explicit `resolveTimezone`
// argument always wins (tests, special cases).
let defaultTimezoneResolver: EffectiveTimezoneResolver | null = null;

export function setDefaultTimezoneResolver(resolver: EffectiveTimezoneResolver | null): void {
  defaultTimezoneResolver = resolver;
}

export function createAuthMiddleware(
  verifyJwt: JwtVerifier,
  checkTenantActive?: TenantActiveChecker,
  resolveClUserPermissions?: ClUserPermissionsResolver,
  resolveTimezone?: EffectiveTimezoneResolver,
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

    const timezoneResolver = resolveTimezone ?? defaultTimezoneResolver;
    if (timezoneResolver) {
      try {
        ctx.timezone = await timezoneResolver(ctx);
      } catch {
        // Timezone is not a security boundary — degrade to the platform
        // default rather than failing the request on a lookup error.
        ctx.timezone = PLATFORM_TIMEZONE;
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
