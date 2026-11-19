import type { IInspectorNoticeRepository } from '../../domain/inspector-notice.repository';

export class CountMyUnreadInspectorNoticesUseCase {
  constructor(private readonly repo: IInspectorNoticeRepository) {}

  async execute(inspectorId: string): Promise<{ count: number }> {
    return { count: await this.repo.countMyUnread(inspectorId) };
  }
}
