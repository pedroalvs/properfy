import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { IPropertyRepository } from '../../domain/property.repository';
import { PropertyNotFoundError, PropertyGeocodingManualOverrideError } from '../../domain/property.errors';
import { sendJob } from '../../../../shared/infrastructure/queue';

export interface GeocodePropertyInput {
  propertyId: string;
  actor: AuthContext;
}

export class GeocodePropertyUseCase {
  constructor(private readonly propertyRepo: IPropertyRepository) {}

  async execute(
    input: GeocodePropertyInput,
  ): Promise<{ propertyId: string; geocodingStatus: string }> {
    const { propertyId, actor } = input;

    if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    // AM/OP can access properties across tenants
    const property = await this.propertyRepo.findById(propertyId, '');
    if (!property || property.isDeleted()) {
      throw new PropertyNotFoundError();
    }

    if (property.geocodingStatus === 'MANUAL') {
      throw new PropertyGeocodingManualOverrideError();
    }

    await this.propertyRepo.update(propertyId, property.tenantId, {
      geocodingStatus: 'PENDING',
    });
    await sendJob('property.geocode', { propertyId }, { retryLimit: 6, retryBackoff: true });

    return { propertyId, geocodingStatus: 'PENDING' };
  }
}
