import type { AuthContext } from '@properfy/shared';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IPropertyRepository } from '../../domain/property.repository';
import { PropertyNotFoundError, PropertyGeocodingManualOverrideError } from '../../domain/property.errors';
import { sendJob } from '../../../../shared/infrastructure/queue';

export interface GeocodePropertyInput {
  propertyId: string;
  actor: AuthContext;
}

export class GeocodePropertyUseCase {
  constructor(
    private readonly propertyRepo: IPropertyRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(
    input: GeocodePropertyInput,
  ): Promise<{ propertyId: string; geocodingStatus: string }> {
    const { propertyId, actor } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'property.import',
      entityType: 'Property',
      entityId: propertyId,
    });

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
