import type { InspectorNoticeAudienceInput } from '@properfy/shared';
import type { IInspectorDirectoryRepository } from '../../domain/inspector-directory.repository';
import {
  InspectorNoticeInvalidRecipientsError,
  InspectorNoticeRegionInactiveError,
  InspectorNoticeRegionNotFoundError,
} from '../../domain/inspector-notice.errors';

export interface ResolvedAudience {
  inspectorIds: string[];
  /** region name snapshot, only for REGION audiences */
  regionName?: string;
}

/**
 * Resolves a manual audience to active recipient ids (status ACTIVE, not soft-deleted).
 * ALL keeps inspectors without a user account. SELECTED validates every id is active.
 * REGION checks the region exists (404) and is active (422) and snapshots its name.
 */
export class ResolveNoticeRecipientsService {
  constructor(private readonly directory: IInspectorDirectoryRepository) {}

  async resolve(audience: InspectorNoticeAudienceInput): Promise<ResolvedAudience> {
    switch (audience.type) {
      case 'ALL':
        return { inspectorIds: await this.directory.findAllActiveInspectorIds() };

      case 'SELECTED': {
        const active = await this.directory.findActiveInspectorIdsByIds(audience.inspectorIds);
        const activeSet = new Set(active);
        const invalid = audience.inspectorIds.filter((id) => !activeSet.has(id));
        if (invalid.length > 0) {
          throw new InspectorNoticeInvalidRecipientsError(invalid);
        }
        // Preserve the caller's (deduped) order rather than the repository's order.
        return { inspectorIds: audience.inspectorIds.filter((id) => activeSet.has(id)) };
      }

      case 'REGION': {
        const region = await this.directory.findRegion(audience.regionId);
        if (!region) {
          throw new InspectorNoticeRegionNotFoundError();
        }
        if (region.status !== 'ACTIVE') {
          throw new InspectorNoticeRegionInactiveError();
        }
        return {
          inspectorIds: await this.directory.findActiveInspectorIdsByRegion(audience.regionId),
          regionName: region.name,
        };
      }
    }
  }
}
