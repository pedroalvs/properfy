import { createHash } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AuthContext, UserRole } from '@properfy/shared';

import type { ApiKey, IApiKeyRepository } from '../../modules/integration/domain/api-key';
import { isApiKeyUsable } from '../../modules/integration/domain/api-key';
import { UnauthorizedError } from '../domain/errors';

export const API_KEY_HEADER = 'x-api-key';

/** Skip the last_used_at write when the key was seen less than this ago. */
const LAST_USED_THROTTLE_MS = 60_000;

type AuthenticateFn = (request: FastifyRequest, reply: FastifyReply) => Promise<void>;

/**
 * Machine-to-machine auth via the `X-API-Key` header (Integrations Hub inbound
 * keys). The key acts as a machine principal carrying the role stored on the
 * key row; `userId` is a synthetic `api-key:<id>` identifier so audit trails
 * distinguish machine calls from human ones.
 *
 * Composition contract: when the header is present the request is decided
 * here (valid key or 401 — no JWT fallback for a bad key); when absent the
 * given JWT middleware handles the request. Business routes must opt in
 * explicitly by using this composite instead of the plain JWT preHandler —
 * v1 wires it into no business route (empty allowlist).
 */
export function createApiKeyAuthMiddleware(
  repo: Pick<IApiKeyRepository, 'findByHash' | 'touchLastUsed'>,
  jwtAuthenticate: AuthenticateFn,
): AuthenticateFn {
  return async function authenticate(request, reply): Promise<void> {
    const header = request.headers[API_KEY_HEADER];
    const provided = Array.isArray(header) ? header[0] : header;
    if (!provided) {
      return jwtAuthenticate(request, reply);
    }

    const keyHash = createHash('sha256').update(provided).digest('hex');
    const key = await repo.findByHash(keyHash);
    if (!key || !isApiKeyUsable(key, new Date())) {
      throw new UnauthorizedError('AUTH_UNAUTHORIZED', 'Invalid, revoked or expired API key');
    }

    touchLastUsed(repo, key);

    const ctx: AuthContext = {
      userId: `api-key:${key.id}`,
      tenantId: null,
      role: key.role as UserRole,
      branchId: null,
      inspectorId: null,
    };
    request.authContext = ctx;
  };
}

function touchLastUsed(
  repo: Pick<IApiKeyRepository, 'touchLastUsed'>,
  key: ApiKey,
): void {
  const now = new Date();
  const stale = !key.lastUsedAt || now.getTime() - key.lastUsedAt.getTime() > LAST_USED_THROTTLE_MS;
  if (!stale) return;
  // Fire-and-forget: a freshness marker must never fail the request.
  void repo.touchLastUsed(key.id, now).catch(() => {});
}
