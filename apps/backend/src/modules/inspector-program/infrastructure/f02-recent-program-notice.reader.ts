import type { HasRecentSystemInspectorNoticeUseCase } from '../../inspector-notice/application/use-cases/has-recent-system-inspector-notice.use-case';
import type { IRecentProgramNoticeReader } from '../domain/recent-program-notice.reader';

/** Adapts F02's `HasRecentSystemInspectorNoticeUseCase` to {@link IRecentProgramNoticeReader}. */
export class F02RecentProgramNoticeReader implements IRecentProgramNoticeReader {
  constructor(private readonly hasRecent: HasRecentSystemInspectorNoticeUseCase) {}

  hasRecentNotice(dedupeKeyPrefix: string, since: Date): Promise<boolean> {
    return this.hasRecent.execute({ dedupeKeyPrefix, since });
  }
}
