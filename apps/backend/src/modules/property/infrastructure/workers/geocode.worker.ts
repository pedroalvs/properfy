import type { IPropertyRepository } from '../../domain/property.repository';
import type { IGeocodingService } from '../../domain/geocoding.service';
import type { Logger } from '../../../../shared/infrastructure/logger';

export class GeocodeWorker {
  constructor(
    private readonly propertyRepo: IPropertyRepository,
    private readonly geocodingService: IGeocodingService,
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

    const result = await this.geocodingService.geocode(property.fullAddress);

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
      this.logger.warn({ propertyId }, 'Geocoding failed for property');
    }
  }
}
