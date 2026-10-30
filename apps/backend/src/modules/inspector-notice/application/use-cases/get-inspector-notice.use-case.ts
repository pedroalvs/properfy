import type { InspectorNoticeDetail } from '@properfy/shared';
import { InspectorNoticeNotFoundError } from '../../domain/inspector-notice.errors';
import type { IInspectorNoticeRepository } from '../../domain/inspector-notice.repository';
import { toDetail } from '../mappers';

export class GetInspectorNoticeUseCase {
  constructor(private readonly repo: IInspectorNoticeRepository) {}

  async execute(noticeId: string): Promise<InspectorNoticeDetail> {
    const row = await this.repo.getDetail(noticeId);
    if (!row) {
      throw new InspectorNoticeNotFoundError();
    }
    return toDetail(row);
  }
}
