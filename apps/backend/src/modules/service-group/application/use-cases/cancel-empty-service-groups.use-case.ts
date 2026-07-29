import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import type { CancelEmptyGroupService } from '../services/cancel-empty-group.service';
import { CANCELLABLE_GROUP_STATUSES } from '../services/cancel-empty-group.service';
import type { Logger } from '../../../../shared/infrastructure/logger';

export interface CancelEmptyServiceGroupsOutput {
  checkedCount: number;
  cancelledCount: number;
  failedCount: number;
}

/**
 * Daily backstop for released groups that have nothing left to execute.
 *
 * Most empty groups are caught reactively the moment their last appointment dies.
 * This sweep exists for the paths that emit no transition event — chiefly appointment
 * soft-delete, which clears nothing but `deleted_at` — plus any pre-existing backlog.
 */
export class CancelEmptyServiceGroupsUseCase {
  constructor(
    private readonly serviceGroupRepo: IServiceGroupRepository,
    private readonly cancelEmptyGroup: CancelEmptyGroupService,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<CancelEmptyServiceGroupsOutput> {
    // Same statuses the cleanup service will accept — asking for any others would
    // just make it reject them one by one.
    const groupIds = await this.serviceGroupRepo.findIdsByStatuses([...CANCELLABLE_GROUP_STATUSES]);

    let cancelledCount = 0;
    let failedCount = 0;

    for (const groupId of groupIds) {
      try {
        if (await this.cancelEmptyGroup.cancelIfDead(groupId)) cancelledCount++;
      } catch (err) {
        // One locked or malformed group must not abort the sweep.
        failedCount++;
        this.logger.error({ groupId, err }, 'Failed to evaluate service group for cancellation');
      }
    }

    this.logger.info(
      { checkedCount: groupIds.length, cancelledCount, failedCount },
      'Empty service group sweep completed',
    );

    return { checkedCount: groupIds.length, cancelledCount, failedCount };
  }
}
