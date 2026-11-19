import { ValidationError } from '../../../../shared/domain/errors';
import type { IInspectorNoticeRepository } from '../../domain/inspector-notice.repository';

/**
 * Read-only guard (L-F08-06): does a system notice exist whose `dedupe_key` starts with
 * `dedupeKeyPrefix` and whose `created_at >= since`? Counts archived notices (it measures
 * the send, not the box) and never counts manual notices (null dedupe_key). No HTTP route.
 */
export interface HasRecentSystemInspectorNoticeInput {
  dedupeKeyPrefix: string;
  since: Date;
}

export class HasRecentSystemInspectorNoticeUseCase {
  constructor(private readonly repo: IInspectorNoticeRepository) {}

  async execute(input: HasRecentSystemInspectorNoticeInput): Promise<boolean> {
    const prefix = input.dedupeKeyPrefix;
    if (prefix.length < 1 || prefix.length > 200) {
      throw new ValidationError('dedupeKeyPrefix must be 1-200 characters');
    }
    return this.repo.existsSystemNoticeByDedupeKeyPrefixSince(prefix, input.since);
  }
}
