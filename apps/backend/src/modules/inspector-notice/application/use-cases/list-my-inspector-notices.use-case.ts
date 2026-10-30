import type { MyInspectorNotice } from '@properfy/shared';
import type { IInspectorNoticeRepository } from '../../domain/inspector-notice.repository';
import { toMyNotice } from '../mappers';

export interface ListMyInspectorNoticesCommand {
  inspectorId: string;
  page: number;
  pageSize: number;
}

export class ListMyInspectorNoticesUseCase {
  constructor(private readonly repo: IInspectorNoticeRepository) {}

  async execute(
    command: ListMyInspectorNoticesCommand,
  ): Promise<{ data: MyInspectorNotice[]; total: number }> {
    const result = await this.repo.listMine(command);
    return { data: result.data.map(toMyNotice), total: result.total };
  }
}
