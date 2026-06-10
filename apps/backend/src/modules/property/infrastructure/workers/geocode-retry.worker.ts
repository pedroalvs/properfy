import type { IPropertyRepository } from '../../domain/property.repository';
import type { Logger } from '../../../../shared/infrastructure/logger';
import { sendJob } from '../../../../shared/infrastructure/queue';
import { metrics } from '../../../../shared/infrastructure/metrics';

const COOL_OFF_HOURS = 24;
/**
 * How long a property may sit in PENDING (with no coordinates) before we treat its geocode
 * job as lost and re-enqueue it. The worker normally geocodes within ~1 min, so 10 min is a
 * safe "this enqueue never landed" threshold.
 */
const PENDING_STALE_MINUTES = 10;

export interface GeocodeRetryResult {
  reenqueuedCount: number;
  pendingReenqueuedCount: number;
  failedGeocodingCount: number;
}

export class GeocodeRetryWorker {
  constructor(
    private readonly propertyRepo: IPropertyRepository,
    private readonly logger: Logger,
  ) {}

  async execute(): Promise<GeocodeRetryResult> {
    const cutoff = new Date(Date.now() - COOL_OFF_HOURS * 60 * 60 * 1000);
    const failedProperties = await this.propertyRepo.findFailedGeocoding(cutoff);

    let reenqueuedCount = 0;
    for (const { id, tenantId } of failedProperties) {
      try {
        await this.propertyRepo.update(id, tenantId, { geocodingStatus: 'PENDING' });
        await sendJob('property.geocode', { propertyId: id }, { retryLimit: 6, retryBackoff: true });
        reenqueuedCount++;
      } catch (err) {
        this.logger.warn({ propertyId: id, error: err }, 'Failed to re-enqueue geocoding job');
      }
    }

    // Self-heal "lost enqueue" cases: properties still PENDING with no coordinates well past the
    // point the worker would have geocoded them. They are already PENDING, so no status flip — we
    // just put the job back on the queue.
    const pendingCutoff = new Date(Date.now() - PENDING_STALE_MINUTES * 60 * 1000);
    const stalePending = await this.propertyRepo.findStalePendingGeocoding(pendingCutoff);

    let pendingReenqueuedCount = 0;
    for (const { id } of stalePending) {
      try {
        await sendJob('property.geocode', { propertyId: id }, { retryLimit: 6, retryBackoff: true });
        pendingReenqueuedCount++;
      } catch (err) {
        this.logger.warn({ propertyId: id, error: err }, 'Failed to re-enqueue stale pending geocoding job');
      }
    }

    // Update the geocoding failed gauge with the current total count
    const failedGeocodingCount = await this.propertyRepo.countFailedGeocoding();
    metrics.setGeocodingFailedCount(failedGeocodingCount);

    return { reenqueuedCount, pendingReenqueuedCount, failedGeocodingCount };
  }
}
