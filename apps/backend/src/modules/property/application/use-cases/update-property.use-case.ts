import type { AuthContext, PropertyType } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IPropertyRepository } from '../../domain/property.repository';
import type { IBranchRepository } from '../../../tenant/domain/branch.repository';
import {
  PropertyNotFoundError,
  BranchInactiveError,
} from '../../domain/property.errors';
import { BranchNotFoundError } from '../../../tenant/domain/tenant.errors';
import { sendJob } from '../../../../shared/infrastructure/queue';

export interface UpdatePropertyInput {
  propertyId: string;
  data: {
    branchId?: string | null;
    type?: PropertyType;
    street?: string;
    addressLine2?: string | null;
    suburb?: string;
    postcode?: string;
    state?: string;
    country?: string;
    latitude?: number | null;
    longitude?: number | null;
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
  street: string;
  addressLine2: string | null;
  suburb: string;
  postcode: string;
  state: string;
  country: string;
  geocodingStatus: string;
  latitude: number | null;
  longitude: number | null;
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

    // Resolve tenantId for lookup
    const tenantId =
      actor.role === 'AM' || actor.role === 'OP'
        ? null // AM/OP: we need to find the property first to know its tenant
        : actor.tenantId!;

    // For CL roles, scope by tenantId; for AM/OP, find property to get its tenantId
    let property;
    if (tenantId) {
      property = await this.propertyRepo.findById(propertyId, tenantId);
    } else {
      // AM/OP: no tenant scope restriction
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
    if (data.street !== undefined) updateData.street = data.street;
    if (data.addressLine2 !== undefined)
      updateData.addressLine2 = data.addressLine2;
    if (data.suburb !== undefined) updateData.suburb = data.suburb;
    if (data.postcode !== undefined) updateData.postcode = data.postcode;
    if (data.state !== undefined) updateData.state = data.state;
    if (data.country !== undefined) updateData.country = data.country;
    if (data.notes !== undefined) updateData.notes = data.notes;
    if (data.rulesJson !== undefined) updateData.rulesJson = data.rulesJson;

    // Check if address fields changed
    const addressChanged = ADDRESS_FIELDS.some(
      (field) => (data as Record<string, unknown>)[field] !== undefined,
    );

    // Manual coordinate override: if lat/lng explicitly provided, set MANUAL status
    if (data.latitude !== undefined && data.longitude !== undefined) {
      updateData.lat = data.latitude;
      updateData.lng = data.longitude;
      updateData.geocodingStatus = 'MANUAL';
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
    if (addressChanged && !(data.latitude !== undefined && data.longitude !== undefined)) {
      await sendJob('property.geocode', { propertyId });
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
      notes: data.notes !== undefined ? data.notes ?? null : property.notes,
      rulesJson:
        (updateData.rulesJson as Record<string, unknown>) ?? property.rulesJson,
      createdAt: property.createdAt,
      updatedAt: new Date(),
    };
  }
}
