import type { AuthContext, InspectorReliabilityResponse, ReliabilityMetricResult, UserRole } from '@properfy/shared';
import { getMatrixEntry } from '@properfy/shared';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IPlatformSettingsReader } from '../../../../shared/domain/platform-settings';
import { civilDateInTimezone, PLATFORM_TIMEZONE } from '../../../../shared/domain/timezone-date';
import { InspectorNotFoundError } from '../../domain/reliability.errors';
import type { SnapshotSettings } from '../../domain/reliability-snapshot.entity';
import type { IReliabilitySnapshotRepository } from '../../domain/reliability-snapshot.repository';
import type { ReliabilityIndexReader } from '../reliability-index.reader';

const RELIABILITY_VIEW_ROLES: UserRole[] = getMatrixEntry('reliability.view')?.roles ?? [];
const ENTITY = 'InspectorReliabilitySnapshot';

export interface GetInspectorReliabilityInput {
  actor: AuthContext;
  inspectorId: string;
  now?: Date;
}

function withWeights(metrics: ReliabilityMetricResult[], settings: SnapshotSettings) {
  return metrics.map((metric) => ({ ...metric, weight: settings.weights[metric.metric] ?? 0 }));
}

/**
 * AM/OP reliability detail for one inspector (03.12). Authorizes `reliability.view`
 * (AM/OP) before any read; 404s an unknown/soft-deleted inspector; returns
 * `NOT_COMPUTED` (no row in the latest snapshot) with an empty metrics array.
 * The eight metrics carry the weights from the snapshot that produced the score.
 */
export class GetInspectorReliabilityUseCase {
  constructor(
    private readonly reader: ReliabilityIndexReader,
    private readonly repo: IReliabilitySnapshotRepository,
    private readonly settingsReader: IPlatformSettingsReader,
    private readonly authService: AuthorizationService,
  ) {}

  async execute(input: GetInspectorReliabilityInput): Promise<InspectorReliabilityResponse> {
    this.authService.assertRoles(input.actor, RELIABILITY_VIEW_ROLES, { action: 'reliability.view', entityType: ENTITY });

    const inspector = await this.repo.findInspector(input.inspectorId);
    if (!inspector) throw new InspectorNotFoundError();

    const [loaded, settingsUpdatedAt] = await Promise.all([
      this.reader.loadLatest(),
      this.reader.getSettingsUpdatedAt(),
    ]);
    const settingsUpdatedIso = settingsUpdatedAt?.toISOString() ?? null;
    const inspectorStatus = inspector.active ? ('ACTIVE' as const) : ('INACTIVE' as const);
    const today = civilDateInTimezone(input.now ?? new Date(), PLATFORM_TIMEZONE);

    const row = loaded?.rowsByInspector.get(input.inspectorId) ?? null;

    if (!loaded || !row) {
      // NOT_COMPUTED — the inspector exists but has no row in the latest snapshot.
      const reliabilityIndex = await this.settingsReader.get('reliabilityIndex');
      return {
        inspectorId: inspector.id,
        inspectorName: inspector.name,
        inspectorStatus,
        status: 'NOT_COMPUTED',
        snapshotDate: loaded?.snapshotDate ?? null,
        windowFrom: loaded?.windowFrom ?? null,
        windowTo: loaded?.windowTo ?? null,
        computedAt: loaded?.computedAt.toISOString() ?? null,
        isStale: loaded ? loaded.snapshotDate < today : false,
        settingsUpdatedAt: settingsUpdatedIso,
        score: null,
        position: null,
        rankedCount: loaded ? this.reader.positionFor(loaded.candidates, input.inspectorId).rankedCount : 0,
        volume: 0,
        completedCount: 0,
        minimumVolume: reliabilityIndex.minimumVolume,
        minimumRatings: reliabilityIndex.minimumRatings,
        volumeReference: null,
        volumeReferenceSource: null,
        metrics: [],
      };
    }

    const { position, rankedCount } = this.reader.positionFor(loaded.candidates, input.inspectorId);

    return {
      inspectorId: inspector.id,
      inspectorName: inspector.name,
      inspectorStatus,
      status: row.status,
      snapshotDate: loaded.snapshotDate,
      windowFrom: loaded.windowFrom,
      windowTo: loaded.windowTo,
      computedAt: loaded.computedAt.toISOString(),
      isStale: loaded.snapshotDate < today,
      settingsUpdatedAt: settingsUpdatedIso,
      score: row.score,
      position,
      rankedCount,
      volume: row.volume,
      completedCount: row.completedCount,
      minimumVolume: row.settings.minimumVolume,
      minimumRatings: row.settings.minimumRatings,
      volumeReference: row.settings.volumeReference.value,
      volumeReferenceSource: row.settings.volumeReference.source,
      metrics: withWeights(row.metrics, row.settings),
    };
  }
}
