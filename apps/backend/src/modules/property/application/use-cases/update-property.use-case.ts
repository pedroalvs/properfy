import type { AuthContext, PropertyType } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IPropertyRepository } from '../../domain/property.repository';
import type { IBranchRepository } from '../../../tenant/domain/branch.repository';
import {
  PropertyNotFoundError,
  PropertyAddressConflictError,
  BranchInactiveError,
} from '../../domain/property.errors';
import { BranchNotFoundError } from '../../../tenant/domain/tenant.errors';
import { sendJob } from '../../../../shared/infrastructure/queue';

export interface UpdatePropertyInput {
  propertyId: string;
  data: {
    branchId?: string | null;
    type?: PropertyType;
    apartmentNumber?: string | null;
    street?: string;
    addressLine2?: string | null;
    suburb?: string;
    postcode?: string;
    state?: string;
    country?: string;
    latitude?: number | null;
    longitude?: number | null;
    privateAreaM2?: number | null;
    totalAreaM2?: number | null;
    furnished?: boolean | null;
    linenProvided?: boolean | null;
    rentAmount?: number | null;
    notes?: string | null;
    rulesJson?: Record<string, unknown> | null;
  };
  actor: AuthContext;
}

export interface UpdatePropertyOutput {
  id: string;
  tenantId: string;
  branchId: string | null;
  propertyCode: string;
  type: string;
  apartmentNumber: string | null;
  street: string;
  addressLine2: string | null;
  suburb: string;
  postcode: string;
  state: string;
  country: string;
  geocodingStatus: string;
  latitude: number | null;
  longitude: number | null;
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

const ADDRESS_FIELDS = ['street', 'suburb', 'postcode', 'state', 'country'];

export class UpdatePropertyUseCase {
  constructor(
    private readonly propertyRepo: IPropertyRepository,
    private readonly branchRepo: IBranchRepository,
    private readonly auditService: AuditService,
  ) {}

  async execute(input: UpdatePropertyInput): Promise<UpdatePropertyOutput> {
    const { propertyId, data, actor } = input;

    // RBAC: AM/OP any tenant, CL_ADMIN/CL_USER own tenant
    if (
      actor.role !== 'AM' &&
      actor.role !== 'OP' &&
      actor.role !== 'CL_ADMIN' &&
      actor.role !== 'CL_USER'
    ) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    // Resolve tenantId for lookup. AM/OP are cross-tenant (no own tenant): both
    // resolve to no scope so the property is found by id, then its own tenant
    // governs branch/update. CL_ADMIN / CL_USER are scoped to their JWT tenant.
    const tenantId =
      actor.role === 'AM' || actor.role === 'OP'
        ? null
        : actor.tenantId!;

    // For OP/CL roles, scope by tenantId; for AM, find property to get its tenantId
    let property;
    if (tenantId) {
      property = await this.propertyRepo.findById(propertyId, tenantId);
    } else {
      // AM: no tenant scope restriction
      property = await this.propertyRepo.findById(propertyId, null);
    }

    if (!property || property.isDeleted()) {
      throw new PropertyNotFoundError();
    }

    // Verify tenant scope for CL roles
    if (
      (actor.role === 'CL_ADMIN' || actor.role === 'CL_USER') &&
      property.tenantId !== actor.tenantId
    ) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    // Validate branch if changing
    if (data.branchId !== undefined && data.branchId !== null) {
      const branch = await this.branchRepo.findById(data.branchId, property.tenantId);
      if (!branch) throw new BranchNotFoundError();
      if (!branch.isActive()) throw new BranchInactiveError();
    }

    // Build update payload
    const updateData: Record<string, unknown> = {};
    if (data.branchId !== undefined) updateData.branchId = data.branchId;
    if (data.type !== undefined) updateData.type = data.type;
    if (data.apartmentNumber !== undefined) updateData.apartmentNumber = data.apartmentNumber;
    if (data.street !== undefined) updateData.street = data.street;
    if (data.addressLine2 !== undefined)
      updateData.addressLine2 = data.addressLine2;
    if (data.suburb !== undefined) updateData.suburb = data.suburb;
    if (data.postcode !== undefined) updateData.postcode = data.postcode;
    if (data.state !== undefined) updateData.state = data.state;
    if (data.country !== undefined) updateData.country = data.country;
    if (data.privateAreaM2 !== undefined) updateData.privateAreaM2 = data.privateAreaM2;
    if (data.totalAreaM2 !== undefined) updateData.totalAreaM2 = data.totalAreaM2;
    if (data.furnished !== undefined) updateData.furnished = data.furnished;
    if (data.linenProvided !== undefined) updateData.linenProvided = data.linenProvided;
    if (data.rentAmount !== undefined) updateData.rentAmount = data.rentAmount;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.rulesJson !== undefined) updateData.rulesJson = data.rulesJson;

    // Check if address fields changed
    const addressChanged = ADDRESS_FIELDS.some(
      (field) => (data as Record<string, unknown>)[field] !== undefined,
    );

    // When the address changes, pre-check uniqueness against the
    // `properties_normalized_address_active_unique` partial unique index —
    // excluding this property itself — so a conflict is a clean 409 instead
    // of an uncaught P2002 surfacing as a 500.
    if (addressChanged) {
      const effectiveAddress = {
        street: data.street ?? property.street,
        addressLine2: data.addressLine2 !== undefined ? data.addressLine2 : property.addressLine2,
        suburb: data.suburb ?? property.suburb,
        state: data.state ?? property.state,
        postcode: data.postcode ?? property.postcode,
      };
      const existingByAddress = await this.propertyRepo.findByNormalizedAddress(property.tenantId, effectiveAddress);
      if (existingByAddress && existingByAddress.id !== property.id) {
        throw new PropertyAddressConflictError();
      }
    }

    // Manual coordinate unlock: clearing both coords on a MANUAL property resets to PENDING
    const isManualCoordinateUnlock =
      data.latitude === null &&
      data.longitude === null &&
      property.geocodingStatus === 'MANUAL';

    // Manual coordinate override: if lat/lng explicitly provided (non-null), set MANUAL status
    if (
      data.latitude !== undefined &&
      data.longitude !== undefined &&
      !isManualCoordinateUnlock
    ) {
      updateData.lat = data.latitude;
      updateData.lng = data.longitude;
      updateData.geocodingStatus = 'MANUAL';
    } else if (isManualCoordinateUnlock) {
      updateData.lat = null;
      updateData.lng = null;
      updateData.geocodingStatus = 'PENDING';
    } else if (addressChanged) {
      updateData.geocodingStatus = 'PENDING';
    }

    const before = {
      propertyCode: property.propertyCode,
      type: property.type,
      street: property.street,
      suburb: property.suburb,
      state: property.state,
      country: property.country,
      geocodingStatus: property.geocodingStatus,
    };

    await this.propertyRepo.update(
      propertyId,
      property.tenantId,
      updateData as Parameters<IPropertyRepository['update']>[2],
    );

    // Enqueue geocoding job on address change (skip if manual coordinates provided)
    // or on manual coordinate unlock (clearing coords on a MANUAL property)
    if (isManualCoordinateUnlock) {
      await sendJob('property.geocode', { propertyId }, { retryLimit: 6, retryBackoff: true });
    } else if (addressChanged && !(data.latitude !== undefined && data.longitude !== undefined)) {
      await sendJob('property.geocode', { propertyId }, { retryLimit: 6, retryBackoff: true });
    }

    const after = {
      propertyCode: property.propertyCode,
      type: (updateData.type as string) ?? property.type,
      street: (updateData.street as string) ?? property.street,
      suburb: (updateData.suburb as string) ?? property.suburb,
      state: (updateData.state as string) ?? property.state,
      country: (updateData.country as string) ?? property.country,
      geocodingStatus:
        (updateData.geocodingStatus as string) ?? property.geocodingStatus,
    };

    this.auditService.log({
      action: 'property.updated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Property',
      entityId: propertyId,
      tenantId: property.tenantId,
      before,
      after,
    });

    return {
      id: property.id,
      tenantId: property.tenantId,
      branchId:
        data.branchId !== undefined ? data.branchId ?? null : property.branchId,
      propertyCode: property.propertyCode,
      type: (updateData.type as string) ?? property.type,
      apartmentNumber:
        data.apartmentNumber !== undefined
          ? data.apartmentNumber
          : property.apartmentNumber,
      street: (updateData.street as string) ?? property.street,
      addressLine2:
        data.addressLine2 !== undefined
          ? data.addressLine2 ?? null
          : property.addressLine2,
      suburb: (updateData.suburb as string) ?? property.suburb,
      postcode: (updateData.postcode as string) ?? property.postcode,
      state: (updateData.state as string) ?? property.state,
      country: (updateData.country as string) ?? property.country,
      geocodingStatus:
        (updateData.geocodingStatus as string) ?? property.geocodingStatus,
      latitude: data.latitude !== undefined ? (data.latitude ?? null) : (property.lat ?? null),
      longitude: data.longitude !== undefined ? (data.longitude ?? null) : (property.lng ?? null),
      privateAreaM2:
        data.privateAreaM2 !== undefined ? data.privateAreaM2 : property.privateAreaM2,
      totalAreaM2: data.totalAreaM2 !== undefined ? data.totalAreaM2 : property.totalAreaM2,
      furnished: data.furnished !== undefined ? data.furnished : property.furnished,
      linenProvided:
        data.linenProvided !== undefined ? data.linenProvided : property.linenProvided,
      rentAmount: data.rentAmount !== undefined ? data.rentAmount : property.rentAmount,
      notes: data.notes !== undefined ? data.notes ?? null : property.notes,
      rulesJson:
        (updateData.rulesJson as Record<string, unknown>) ?? property.rulesJson,
      createdAt: property.createdAt,
      updatedAt: new Date(),
    };
  }
}
