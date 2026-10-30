import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { ITenantRepository } from '../../domain/tenant.repository';
import type { IBranchRepository } from '../../domain/branch.repository';
import {
  type IGeocodingService,
  MapboxPermanentGeocodingUnavailableError,
} from '../../../property/domain/geocoding.service';
import {
  geocodeWithTimeout,
  GeocodeTimeoutError,
} from '../../../property/application/services/geocode-with-timeout';
import {
  formatGeocodingQuery,
  isSameGeocodingAddress,
  type GeocodableAddress,
} from '../../../../shared/domain/geocoding-address';
import {
  TenantNotFoundError,
  BranchNotFoundError,
  BranchNameConflictError,
} from '../../domain/tenant.errors';
import type { DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import { BRANCH_EVENTS } from '../../../../shared/application/events/domain-event-bus';

export interface UpdateBranchInput {
  tenantId: string;
  branchId: string;
  data: {
    name?: string;
    address?: Record<string, unknown> | null;
    contactEmail?: string | null;
  };
  actor: AuthContext;
}

export interface UpdateBranchOutput {
  id: string;
  tenantId: string;
  name: string;
  addressJson: Record<string, unknown> | null;
  contactEmail: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export class UpdateBranchUseCase {
  constructor(
    private readonly tenantRepo: ITenantRepository,
    private readonly branchRepo: IBranchRepository,
    private readonly auditService: AuditService,
    private readonly eventBus?: DomainEventBus,
    // Optional, and LAST, so existing wirings and untyped test constructors keep
    // compiling. A geocoding failure never fails the save.
    private readonly geocodingService?: IGeocodingService,
    private readonly logger?: Logger,
  ) {}

  async execute(input: UpdateBranchInput): Promise<UpdateBranchOutput> {
    const { tenantId, branchId, data, actor } = input;

    // RBAC: AM any; OP any; CL_ADMIN own tenant (name+address)
    if (
      actor.role !== 'AM' &&
      actor.role !== 'OP' &&
      (actor.role !== 'CL_ADMIN' || actor.tenantId !== tenantId)
    ) {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant || tenant.isDeleted()) {
      throw new TenantNotFoundError();
    }

    const branch = await this.branchRepo.findById(branchId, tenantId);
    if (!branch || branch.isDeleted()) {
      throw new BranchNotFoundError();
    }

    // Check name uniqueness if changing (case-insensitive)
    if (data.name && data.name.toLowerCase() !== branch.name.toLowerCase()) {
      const existing = await this.branchRepo.findByName(tenantId, data.name);
      if (existing) {
        throw new BranchNameConflictError();
      }
    }

    const before = {
      name: branch.name,
      addressJson: branch.addressJson,
      contactEmail: branch.contactEmail,
    };

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.contactEmail !== undefined) updateData.contactEmail = data.contactEmail;

    // Address write rules (X02-1, dec. 20):
    // - address absent: do not touch address_json or the marker.
    // - address unchanged (isSameGeocodingAddress) and marker present: keep the
    //   stored coordinates (copy them into the new JSON) and the marker, no Mapbox.
    // - address changed, or unchanged with a null marker: geocode in permanent mode.
    //   On success write coords + marker=now; on null/error/timeout write the JSON
    //   WITHOUT coords and an explicit null marker. A failure never fails the save.
    if (data.address) {
      const { latitude: _lat, longitude: _lng, ...clean } = data.address;
      const oldAddress = (branch.addressJson ?? {}) as unknown as GeocodableAddress;
      const sameAddress = isSameGeocodingAddress(oldAddress, clean as unknown as GeocodableAddress);

      if (sameAddress && branch.geocodedPermanentlyAt) {
        const old = (branch.addressJson ?? {}) as Record<string, unknown>;
        // The repository replaces the whole JSON, so copy the stored coordinates forward.
        updateData.addressJson = { ...clean, latitude: old.latitude, longitude: old.longitude };
        // marker intentionally not set — kept as-is.
      } else if (this.geocodingService) {
        try {
          const coords = await geocodeWithTimeout(
            this.geocodingService,
            formatGeocodingQuery(clean as unknown as GeocodableAddress),
          );
          if (coords) {
            updateData.addressJson = { ...clean, latitude: coords.lat, longitude: coords.lng };
            updateData.geocodedPermanentlyAt = new Date();
          } else {
            updateData.addressJson = clean;
            updateData.geocodedPermanentlyAt = null;
            this.logger?.warn(
              { branchId, tenantId, reason: 'no_results' },
              'branch.geocode_failed_saved_without_coordinates',
            );
          }
        } catch (err) {
          updateData.addressJson = clean;
          updateData.geocodedPermanentlyAt = null;
          if (err instanceof MapboxPermanentGeocodingUnavailableError) {
            this.logger?.error(
              { branchId, tenantId, code: err.code },
              'branch.geocode_permanent_unavailable',
            );
          } else {
            this.logger?.warn(
              { branchId, tenantId, reason: err instanceof GeocodeTimeoutError ? 'timeout' : 'error' },
              'branch.geocode_failed_saved_without_coordinates',
            );
          }
        }
      } else {
        // No geocoder available: store the address without coordinates.
        updateData.addressJson = clean;
        updateData.geocodedPermanentlyAt = null;
      }
    }

    await this.branchRepo.update(branchId, tenantId, updateData);

    const after = {
      name: (updateData.name as string) ?? branch.name,
      addressJson:
        (updateData.addressJson as Record<string, unknown> | null) ??
        branch.addressJson,
      contactEmail:
        updateData.contactEmail !== undefined
          ? (updateData.contactEmail as string | null)
          : branch.contactEmail,
    };

    this.auditService.log({
      action: 'branch.updated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Branch',
      entityId: branchId,
      tenantId,
      before,
      after,
    });

    this.eventBus?.emit({
      type: BRANCH_EVENTS.UPDATED,
      payload: { branchId, tenantId, changedFields: Object.keys(updateData) },
      occurredAt: new Date(),
    });

    return {
      id: branch.id,
      tenantId: branch.tenantId,
      name: after.name,
      addressJson: after.addressJson,
      contactEmail: after.contactEmail,
      status: branch.status,
      createdAt: branch.createdAt,
      updatedAt: new Date(),
    };
  }
}
