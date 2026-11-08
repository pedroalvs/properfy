import { minScoreForLevel, PLATFORM_TIMEZONE } from '@properfy/shared';
import { civilDateInTimezone } from '../../../shared/domain/timezone-date';
import type { IPlatformSettingsReader } from '../../../shared/domain/platform-settings';
import {
  resolveEarlyAccessParams,
  type EarlyAccessLogger,
  type EarlyAccessParams,
} from '../../service-group/domain/early-access';
import type { IOfferEarlyAccessPolicy } from '../../service-group/domain/offer-early-access.policy';
import type { InspectorProgramStandingService } from './inspector-program-standing.service';
import type { ReliabilityIndexReader } from '../../reliability/application/reliability-index.reader';

type StandingPort = Pick<InspectorProgramStandingService, 'hasEarlyAccess'>;
type SnapshotDatePort = Pick<ReliabilityIndexReader, 'findLatestSnapshotDate'>;

/**
 * Inspector-program adapter for the service-group `IOfferEarlyAccessPolicy` port.
 * Composes the F08-1 standing service (viewer level → qualifies?), the F07 latest
 * snapshot date and `minScoreForLevel` into the pure `resolveEarlyAccessParams`.
 * Resolves at most once per request; reads no snapshot when early access is off
 * or the viewer already qualifies.
 */
export class OfferEarlyAccessPolicy implements IOfferEarlyAccessPolicy {
  constructor(
    private readonly standingService: StandingPort,
    private readonly settingsReader: IPlatformSettingsReader,
    private readonly indexReader: SnapshotDatePort,
    private readonly logger: EarlyAccessLogger,
  ) {}

  async resolve(inspectorId: string, now: Date): Promise<EarlyAccessParams | null> {
    const settings = await this.settingsReader.get('inspectorProgram');
    if (!settings.earlyAccess.enabled) return null;

    const { hasAccess } = await this.standingService.hasEarlyAccess(inspectorId, now);
    if (hasAccess) return null;

    const latestSnapshotDate = await this.indexReader.findLatestSnapshotDate();

    return resolveEarlyAccessParams(
      {
        enabled: true,
        hours: settings.earlyAccess.hours,
        minScore: minScoreForLevel(settings.earlyAccess.minLevel, settings.levels),
        latestSnapshotDate,
        viewerQualifies: false,
        now,
        todaySydney: civilDateInTimezone(now, PLATFORM_TIMEZONE),
        enabledAt: settings.earlyAccess.enabledAt,
      },
      this.logger,
    );
  }
}
