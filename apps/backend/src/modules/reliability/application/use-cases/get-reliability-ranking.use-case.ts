import type { AuthContext, ReliabilityRankingResponse, UserRole } from '@properfy/shared';
import { getMatrixEntry } from '@properfy/shared';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IPlatformSettingsReader } from '../../../../shared/domain/platform-settings';
import { civilDateInTimezone, PLATFORM_TIMEZONE } from '../../../../shared/domain/timezone-date';
import { rankSnapshots } from '../../domain/ranking';
import type { ReliabilityIndexReader } from '../reliability-index.reader';

const RELIABILITY_VIEW_ROLES: UserRole[] = getMatrixEntry('reliability.view')?.roles ?? [];
const ENTITY = 'InspectorReliabilitySnapshot';

export interface GetReliabilityRankingInput {
  actor: AuthContext;
  /** Injectable clock for `isStale`. */
  now?: Date;
}

/**
 * AM/OP reliability ranking from the latest snapshot (03.11). Authorizes
 * `reliability.view` (AM/OP) before any read; a forbidden actor gets an audited
 * 403 and no repository access.
 */
export class GetReliabilityRankingUseCase {
  constructor(
    private readonly reader: ReliabilityIndexReader,
    private readonly settingsReader: IPlatformSettingsReader,
    private readonly authService: AuthorizationService,
  ) {}

  async execute(input: GetReliabilityRankingInput): Promise<ReliabilityRankingResponse> {
    this.authService.assertRoles(input.actor, RELIABILITY_VIEW_ROLES, { action: 'reliability.view', entityType: ENTITY });

    const [loaded, settingsUpdatedAt] = await Promise.all([
      this.reader.loadLatest(),
      this.reader.getSettingsUpdatedAt(),
    ]);
    const settingsUpdatedIso = settingsUpdatedAt?.toISOString() ?? null;

    if (!loaded) {
      const reliabilityIndex = await this.settingsReader.get('reliabilityIndex');
      return {
        snapshotDate: null,
        windowFrom: null,
        windowTo: null,
        computedAt: null,
        isStale: false,
        settingsUpdatedAt: settingsUpdatedIso,
        minimumVolume: reliabilityIndex.minimumVolume,
        volumeReference: null,
        volumeReferenceSource: null,
        ranked: [],
        notEnoughData: [],
      };
    }

    const today = civilDateInTimezone(input.now ?? new Date(), PLATFORM_TIMEZONE);
    const { ranked, notEnoughData } = rankSnapshots(loaded.candidates);

    return {
      snapshotDate: loaded.snapshotDate,
      windowFrom: loaded.windowFrom,
      windowTo: loaded.windowTo,
      computedAt: loaded.computedAt.toISOString(),
      isStale: loaded.snapshotDate < today,
      settingsUpdatedAt: settingsUpdatedIso,
      minimumVolume: loaded.settings.minimumVolume,
      volumeReference: loaded.settings.volumeReference.value,
      volumeReferenceSource: loaded.settings.volumeReference.source,
      ranked,
      notEnoughData,
    };
  }
}
