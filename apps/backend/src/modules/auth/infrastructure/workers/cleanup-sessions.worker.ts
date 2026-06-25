import type { ISessionRepository } from '../../domain/session.repository';
import type { Logger } from '../../../../shared/infrastructure/logger';

export class CleanupSessionsWorker {
  constructor(
    private readonly sessionRepo: ISessionRepository,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<{ deletedCount: number }> {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    const deletedCount = await this.sessionRepo.deleteExpiredBefore(cutoff);
    this.logger.info({ deletedCount }, 'Session cleanup completed');
    return { deletedCount };
  }
}
