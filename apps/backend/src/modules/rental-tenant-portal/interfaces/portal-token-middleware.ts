import type { FastifyReply, FastifyRequest } from 'fastify';
import type { IRentalTenantPortalTokenRepository } from '../domain/rental-tenant-portal-token.repository';
import type { Logger } from '../../../shared/infrastructure/logger';
import {
  PortalTokenInvalidError,
  PortalTokenRevokedError,
  PortalTokenSupersededError,
} from '../domain/rental-tenant-portal.errors';

export interface PortalContext {
  tokenId: string;
  appointmentId: string;
  isReadOnly: boolean;
  isPastConfirmCutoff: boolean;
  isUsed: boolean;
  tokenStatus: string;
  expiresAt: string; // ISO 8601
}

declare module 'fastify' {
  interface FastifyRequest {
    portalContext?: PortalContext;
  }
}

export type TokenHasher = (rawToken: string) => string;

export function createPortalTokenMiddleware(
  tokenRepo: IRentalTenantPortalTokenRepository,
  hashToken: TokenHasher,
  logger?: Logger,
) {
  return async function resolvePortalToken(
    request: FastifyRequest,
    _reply: FastifyReply,
  ): Promise<void> {
    const { token: rawToken } = request.params as { token: string };
    if (!rawToken) {
      throw new PortalTokenInvalidError();
    }

    const tokenHash = hashToken(rawToken);
    const tokenEntity = await tokenRepo.findByTokenHash(tokenHash);

    if (!tokenEntity) {
      throw new PortalTokenInvalidError();
    }

    if (tokenEntity.isRevoked()) {
      throw new PortalTokenRevokedError();
    }

    // 028: tokens whose confirmation cycle was superseded (date changed, reopened, etc.)
    // are no longer valid for any tenant portal action.
    if (tokenEntity.status === 'SUPERSEDED') {
      throw new PortalTokenSupersededError();
    }

    const now = new Date();
    let isReadOnly = false;

    if (tokenEntity.isActive() && tokenEntity.isExpired(now)) {
      tokenEntity.markExpired();
      isReadOnly = true;
      // Best-effort status sync. The read-only view is already derived above, so
      // a failed write must never turn a valid read into a 500 — the 15-min
      // rental-tenant-portal.expire-tokens cron reconciles the row later.
      try {
        await tokenRepo.updateStatus(tokenEntity.id, tokenEntity.appointmentId, 'EXPIRED');
      } catch (err) {
        logger?.warn(
          { err, tokenId: tokenEntity.id, appointmentId: tokenEntity.appointmentId },
          'Failed to persist EXPIRED status for portal token; serving read-only anyway',
        );
      }
    } else if (tokenEntity.status === 'EXPIRED') {
      isReadOnly = true;
    }

    request.portalContext = {
      tokenId: tokenEntity.id,
      appointmentId: tokenEntity.appointmentId,
      isReadOnly,
      isPastConfirmCutoff: tokenEntity.isPastConfirmCutoff(now),
      isUsed: tokenEntity.isUsed(),
      tokenStatus: tokenEntity.status,
      expiresAt: tokenEntity.expiresAt.toISOString(),
    };
  };
}
