import type { Prisma } from '@prisma/client';
import type { ParticipantInspector } from './participants';

/**
 * Reads the inspector directory the closure job and standing service need:
 * active inspectors (for participant resolution) and the region → inspector links
 * (for `REGION_VOLUME` participation). Platform-scoped — never filtered by tenant.
 */
export interface IProgramInspectorReader {
  loadActiveInspectors(tx?: Prisma.TransactionClient): Promise<ParticipantInspector[]>;
  /** Map of regionId → set of linked inspector ids, for the given regions. */
  loadRegionInspectorIds(
    regionIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, Set<string>>>;
}
