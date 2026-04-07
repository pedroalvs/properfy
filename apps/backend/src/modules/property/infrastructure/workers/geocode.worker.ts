import type { IPropertyRepository } from '../../domain/property.repository';
import type { IGeocodingService } from '../../domain/geocoding.service';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { Logger } from '../../../../shared/infrastructure/logger';
import { metrics } from '../../../../shared/infrastructure/metrics';

export class GeocodeWorker {
  constructor(
    private readonly propertyRepo: IPropertyRepository,
    private readonly geocodingService: IGeocodingService,
    private readonly auditService: AuditService,
    private readonly logger: Logger,
  ) {}

  async execute(data: { propertyId: string }): Promise<void> {
    const { propertyId } = data;
    const property = await this.propertyRepo.findById(propertyId, '');
    if (!property || property.isDeleted()) {
      this.logger.warn({ propertyId }, 'Property not found for geocoding');
      return;
    }

    if (
      property.geocodingStatus === 'MANUAL' ||
      property.geocodingStatus === 'SUCCESS'
    ) {
      this.logger.info(
        { propertyId },
        'Property already geocoded or manual, skipping',
      );
      return;
    }

    const fullAddress = property.fullAddress;

    let result: { lat: number; lng: number } | null;
    try {
      result = await this.geocodingService.geocode(fullAddress);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      await this.propertyRepo.update(propertyId, property.tenantId, {
        geocodingStatus: 'FAILED',
      });
      this.auditService.log({
        action: 'property.geocoding_failed',
        actorType: 'SYSTEM',
        entityType: 'Property',
        entityId: property.id,
        tenantId: property.tenantId,
        metadata: { address: fullAddress, reason: `Geocoding service error: ${errorMessage}` },
      });
      this.logger.error({ propertyId, error: err }, 'Geocoding service threw an error');
      await this.updateFailedGauge();
      return;
    }

    if (result) {
      await this.propertyRepo.update(propertyId, property.tenantId, {
        lat: result.lat,
        lng: result.lng,
        geocodingStatus: 'SUCCESS',
      });
      this.logger.info(
        { propertyId, lat: result.lat, lng: result.lng },
        'Property geocoded successfully',
      );
    } else {
      await this.propertyRepo.update(propertyId, property.tenantId, {
        geocodingStatus: 'FAILED',
      });
      this.auditService.log({
        action: 'property.geocoding_failed',
        actorType: 'SYSTEM',
        entityType: 'Property',
        entityId: property.id,
        tenantId: property.tenantId,
        metadata: { address: fullAddress, reason: 'Geocoding service returned no results' },
      });
      this.logger.warn({ propertyId }, 'Geocoding failed for property');
      await this.updateFailedGauge();
    }
  }

  private async updateFailedGauge(): Promise<void> {
    try {
      const count = await this.propertyRepo.countFailedGeocoding();
      metrics.setGeocodingFailedCount(count);
    } catch {
      // Non-critical — metric update failure should not affect the worker
    }
  }
}
