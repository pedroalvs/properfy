import type { Clock } from '../../../../shared/domain/clock';
import { InspectorNoticeNotFoundError } from '../../domain/inspector-notice.errors';
import type { IInspectorNoticeRepository } from '../../domain/inspector-notice.repository';

export interface MarkInspectorNoticeReadOutput {
  noticeId: string;
  readAt: string;
}

export class MarkInspectorNoticeReadUseCase {
  constructor(
    private readonly repo: IInspectorNoticeRepository,
    private readonly clock: Clock,
  ) {}

  async execute(inspectorId: string, noticeId: string): Promise<MarkInspectorNoticeReadOutput> {
    // Idempotent: the first read_at wins (COALESCE). No audit — read is telemetry.
    const readAt = await this.repo.markRead(inspectorId, noticeId, this.clock.now());
    if (!readAt) {
      throw new InspectorNoticeNotFoundError();
    }
    return { noticeId, readAt: readAt.toISOString() };
  }
}
