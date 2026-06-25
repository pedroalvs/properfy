import type { ITenantPortalTokenRepository } from '../../domain/tenant-portal-token.repository';
import type { Logger } from '../../../../shared/infrastructure/logger';

export class ExpireTokensWorker {
  constructor(
    private readonly tokenRepo: ITenantPortalTokenRepository,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<{ expiredCount: number }> {
    const expiredCount = await this.tokenRepo.expireActiveTokens();
    if (expiredCount > 0) {
      this.logger.info({ expiredCount }, 'Expired portal tokens');
    }
    return { expiredCount };
  }
}
