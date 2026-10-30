import type { InspectorNoticeSummary } from '@properfy/shared';
import type {
  IInspectorNoticeRepository,
  ListNoticeStatus,
} from '../../domain/inspector-notice.repository';
import { toSummary } from '../mappers';

export interface ListInspectorNoticesCommand {
  status: ListNoticeStatus;
  page: number;
  pageSize: number;
}

export class ListInspectorNoticesUseCase {
  constructor(private readonly repo: IInspectorNoticeRepository) {}

  async execute(
    command: ListInspectorNoticesCommand,
  ): Promise<{ data: InspectorNoticeSummary[]; total: number }> {
    const result = await this.repo.listSummaries(command);
    return { data: result.data.map(toSummary), total: result.total };
  }
}
