import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { IPropertyRepository } from '../../domain/property.repository';
import { PropertyNotFoundError } from '../../domain/property.errors';

export interface GetPropertyInput {
  propertyId: string;
  tenantId?: string;
  actor: AuthContext;
}

export interface GetPropertyOutput {
  id: string;
  tenantId: string;
  branchId: string | null;
  propertyCode: string;
  type: string;
  street: string;
  addressLine2: string | null;
  suburb: string;
  postcode: string;
  state: string;
  country: string;
  lat: number | null;
  lng: number | null;
  geocodingStatus: string;
  notes: string | null;
  rulesJson: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class GetPropertyUseCase {
  constructor(private readonly propertyRepo: IPropertyRepository) {}

  async execute(input: GetPropertyInput): Promise<GetPropertyOutput> {
    const { propertyId, actor } = input;

    // Resolve tenantId based on role
    let tenantId: string;
    if (actor.role === 'AM' || actor.role === 'OP') {
      // AM/OP: use provided tenantId or search across tenants
      // For scoped lookup we need a tenantId; if not provided we cannot scope
      if (input.tenantId) {
        tenantId = input.tenantId;
      } else {
        // AM/OP can view any property - we need to find it without tenant scoping
        // Since repo requires tenantId, AM/OP must provide it or we iterate
        // For simplicity, require tenantId for AM/OP as well in the interface
        // but allow a fallback: try to find across all tenants is not supported
        // by the repo interface, so tenantId is effectively required
        throw new ForbiddenError(
          'AUTH_FORBIDDEN',
          'tenantId is required to look up a property',
        );
      }
    } else if (actor.role === 'CL_ADMIN' || actor.role === 'CL_USER') {
      tenantId = actor.tenantId!;
    } else {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const property = await this.propertyRepo.findById(propertyId, tenantId);
    if (!property || property.isDeleted()) {
      throw new PropertyNotFoundError();
    }

    // For CL roles, verify tenant scope
    if (
      (actor.role === 'CL_ADMIN' || actor.role === 'CL_USER') &&
      property.tenantId !== actor.tenantId
    ) {
      throw new ForbiddenError(
        'AUTH_FORBIDDEN',
        'Insufficient permissions',
      );
    }

    return {
      id: property.id,
      tenantId: property.tenantId,
      branchId: property.branchId,
      propertyCode: property.propertyCode,
      type: property.type,
      street: property.street,
      addressLine2: property.addressLine2,
      suburb: property.suburb,
      postcode: property.postcode,
      state: property.state,
      country: property.country,
      lat: property.lat,
      lng: property.lng,
      geocodingStatus: property.geocodingStatus,
      notes: property.notes,
      rulesJson: property.rulesJson,
      createdAt: property.createdAt,
      updatedAt: property.updatedAt,
    };
  }
}
