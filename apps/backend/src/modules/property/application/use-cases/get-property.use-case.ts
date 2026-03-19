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
  branchName: string | null;
  propertyCode: string;
  type: string;
  street: string;
  addressLine2: string | null;
  suburb: string;
  postcode: string;
  state: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
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

    const found = await this.propertyRepo.findByIdWithBranch(propertyId, tenantId);
    if (!found || found.property.isDeleted()) {
      throw new PropertyNotFoundError();
    }

    // For CL roles, verify tenant scope
    if (
      (actor.role === 'CL_ADMIN' || actor.role === 'CL_USER') &&
      found.property.tenantId !== actor.tenantId
    ) {
      throw new ForbiddenError(
        'AUTH_FORBIDDEN',
        'Insufficient permissions',
      );
    }

    return {
      id: found.property.id,
      tenantId: found.property.tenantId,
      branchId: found.property.branchId,
      branchName: found.branchName,
      propertyCode: found.property.propertyCode,
      type: found.property.type,
      street: found.property.street,
      addressLine2: found.property.addressLine2,
      suburb: found.property.suburb,
      postcode: found.property.postcode,
      state: found.property.state,
      country: found.property.country,
      latitude: found.property.lat,
      longitude: found.property.lng,
      geocodingStatus: found.property.geocodingStatus,
      notes: found.property.notes,
      rulesJson: found.property.rulesJson,
      createdAt: found.property.createdAt,
      updatedAt: found.property.updatedAt,
    };
  }
}
