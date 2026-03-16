import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ITenantPortalTokenRepository } from '../domain/tenant-portal-token.repository';
import {
  PortalTokenInvalidError,
  PortalTokenRevokedError,
} from '../domain/tenant-portal.errors';

export interface PortalContext {
  tokenId: string;
  appointmentId: string;
  isReadOnly: boolean;
  tokenStatus: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    portalContext?: PortalContext;
  }
}

export type TokenHasher = (rawToken: string) => string;

export function createPortalTokenMiddleware(
  tokenRepo: ITenantPortalTokenRepository,
  hashToken: TokenHasher,
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

    const now = new Date();
    let isReadOnly = false;

    if (tokenEntity.isActive() && tokenEntity.isExpired(now)) {
      tokenEntity.markExpired();
      await tokenRepo.updateStatus(tokenEntity.id, 'EXPIRED');
      isReadOnly = true;
    } else if (tokenEntity.status === 'EXPIRED') {
      isReadOnly = true;
    }

    request.portalContext = {
      tokenId: tokenEntity.id,
      appointmentId: tokenEntity.appointmentId,
      isReadOnly,
      tokenStatus: tokenEntity.status,
    };
  };
}
