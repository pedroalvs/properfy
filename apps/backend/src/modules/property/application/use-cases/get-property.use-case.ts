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

    // Resolve tenantId for scoping
    let tenantId: string | undefined;
    if (actor.role === 'AM' || actor.role === 'OP') {
      tenantId = input.tenantId; // optional — AM/OP can look up any property
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
