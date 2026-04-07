import type { IPropertyRepository } from '../../domain/property.repository';
import type { Logger } from '../../../../shared/infrastructure/logger';
import { sendJob } from '../../../../shared/infrastructure/queue';
import { metrics } from '../../../../shared/infrastructure/metrics';

const COOL_OFF_HOURS = 24;

export interface GeocodeRetryResult {
  reenqueuedCount: number;
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

    // Update the geocoding failed gauge with the current total count
    const failedGeocodingCount = await this.propertyRepo.countFailedGeocoding();
    metrics.setGeocodingFailedCount(failedGeocodingCount);

    return { reenqueuedCount, failedGeocodingCount };
  }
}
