import type { Clock } from '../../../../shared/domain/clock';
import type { IInspectorNoticeRepository } from '../../domain/inspector-notice.repository';

export interface MarkAllMyInspectorNoticesReadOutput {
  count: number;
}

export class MarkAllMyInspectorNoticesReadUseCase {
  constructor(
    private readonly repo: IInspectorNoticeRepository,
    private readonly clock: Clock,
  ) {}

  /**
   * Mark every unread notice of the calling inspector read in one bulk update.
   * Idempotent: a second call with nothing left unread returns `{ count: 0 }`.
   * No audit — reads are telemetry (same stance as the per-item mark-read).
   */
  async execute(inspectorId: string): Promise<MarkAllMyInspectorNoticesReadOutput> {
    const count = await this.repo.markAllMineRead(inspectorId, this.clock.now());
    return { count };
  }
}
