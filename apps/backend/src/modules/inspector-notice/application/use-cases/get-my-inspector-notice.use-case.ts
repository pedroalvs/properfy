import type { MyInspectorNotice } from '@properfy/shared';
import { InspectorNoticeNotFoundError } from '../../domain/inspector-notice.errors';
import type { IInspectorNoticeRepository } from '../../domain/inspector-notice.repository';
import { toMyNotice } from '../mappers';

export class GetMyInspectorNoticeUseCase {
  constructor(private readonly repo: IInspectorNoticeRepository) {}

  async execute(inspectorId: string, noticeId: string): Promise<MyInspectorNotice> {
    // 404 (not 403) when not a recipient or the notice is archived — no existence leak.
    const row = await this.repo.getMine(inspectorId, noticeId);
    if (!row) {
      throw new InspectorNoticeNotFoundError();
    }
    return toMyNotice(row);
  }
}
