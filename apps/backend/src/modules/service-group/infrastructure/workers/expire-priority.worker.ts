import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { Logger } from '../../../../shared/infrastructure/logger';

const SYSTEM_CANCEL_REASON = 'Priority window expired (system auto-cancel)';

export class ExpirePriorityWorker {
  constructor(
    private readonly serviceGroupRepo: IServiceGroupRepository,
    private readonly auditService: AuditService,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<{ expiredCount: number }> {
    const expiredGroups = await this.serviceGroupRepo.findExpiredPublished();

    if (expiredGroups.length === 0) {
      this.logger.info('No expired priority groups found');
      return { expiredCount: 0 };
    }

    let expiredCount = 0;

    for (const group of expiredGroups) {
      try {
        await this.serviceGroupRepo.update(group.id, {
          status: 'CANCELLED',
        });

        await this.serviceGroupRepo.unlinkAppointments(group.id);

        this.auditService.log({
          action: 'service_group.cancelled',
          actorType: 'SYSTEM',
          entityType: 'ServiceGroup',
          entityId: group.id,
          tenantId: group.tenantId,
          before: { status: group.status },
          after: { status: 'CANCELLED' },
          reason: SYSTEM_CANCEL_REASON,
        });

        expiredCount++;
      } catch (err) {
        this.logger.error(
          { groupId: group.id, err },
          'Failed to auto-cancel expired priority group',
        );
      }
    }

    this.logger.info({ expiredCount, total: expiredGroups.length }, 'Priority expiry sweep completed');
    return { expiredCount };
  }
}
