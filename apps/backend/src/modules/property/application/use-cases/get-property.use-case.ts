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
  tenantName: string | null;
  propertyCode: string;
  type: string;
  apartmentNumber: string | null;
  street: string;
  addressLine2: string | null;
  suburb: string;
  postcode: string;
  state: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  geocodingStatus: string;
  privateAreaM2: number | null;
  totalAreaM2: number | null;
  furnished: boolean | null;
  linenProvided: boolean | null;
  rentAmount: number | null;
  notes: string | null;
  rulesJson: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export class GetPropertyUseCase {
  constructor(private readonly propertyRepo: IPropertyRepository) {}

  async execute(input: GetPropertyInput): Promise<GetPropertyOutput> {
    const { propertyId, actor } = input;

    // Resolve tenantId for scoping. Only AM is cross-tenant per Sprint 1
    // W-4-IMPL (CORRECTION-001 close-it, 2026-04-13).
    let tenantId: string | undefined;
    if (actor.role === 'AM') {
      tenantId = input.tenantId; // optional — AM can look up any property
    } else if (actor.role === 'OP' || actor.role === 'CL_ADMIN' || actor.role === 'CL_USER') {
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
      tenantName: found.tenantName,
      propertyCode: found.property.propertyCode,
      type: found.property.type,
      apartmentNumber: found.property.apartmentNumber,
      street: found.property.street,
      addressLine2: found.property.addressLine2,
      suburb: found.property.suburb,
      postcode: found.property.postcode,
      state: found.property.state,
      country: found.property.country,
      latitude: found.property.lat,
      longitude: found.property.lng,
      geocodingStatus: found.property.geocodingStatus,
      privateAreaM2: found.property.privateAreaM2,
      totalAreaM2: found.property.totalAreaM2,
      furnished: found.property.furnished,
      linenProvided: found.property.linenProvided,
      rentAmount: found.property.rentAmount,
      notes: found.property.notes,
      rulesJson: found.property.rulesJson,
      createdAt: found.property.createdAt,
      updatedAt: found.property.updatedAt,
    };
  }
}
