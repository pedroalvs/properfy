import type { InspectorNoticeSummary } from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { Clock } from '../../../../shared/domain/clock';
import { InspectorNoticeNotFoundError } from '../../domain/inspector-notice.errors';
import type { IInspectorNoticeRepository } from '../../domain/inspector-notice.repository';
import { toSummary } from '../mappers';

export interface ArchiveInspectorNoticeCommand {
  noticeId: string;
  actorUserId: string;
  requestId?: string;
}

export class ArchiveInspectorNoticeUseCase {
  constructor(
    private readonly repo: IInspectorNoticeRepository,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  async execute(command: ArchiveInspectorNoticeCommand): Promise<InspectorNoticeSummary> {
    const result = await this.repo.archiveIfActive(command.noticeId, this.clock.now());
    if (!result) {
      throw new InspectorNoticeNotFoundError();
    }

    // Only the first archive produces an audit entry (idempotent, CAS lost → no audit).
    if (result.changed && result.entity.archivedAt) {
      this.audit.log({
        action: 'inspector_notice.archived',
        actorType: 'USER',
        actorId: command.actorUserId,
        entityType: 'InspectorNotice',
        entityId: command.noticeId,
        tenantId: null,
        before: { archivedAt: null },
        after: { archivedAt: result.entity.archivedAt.toISOString() },
        requestId: command.requestId,
      });
    }

    const summary = await this.repo.getSummary(command.noticeId);
    if (!summary) {
      throw new InspectorNoticeNotFoundError();
    }
    return toSummary(summary);
  }
}
