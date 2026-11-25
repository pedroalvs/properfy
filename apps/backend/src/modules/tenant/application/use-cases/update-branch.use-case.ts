import type { AuthContext } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { ITenantRepository } from '../../domain/tenant.repository';
import type { IBranchRepository } from '../../domain/branch.repository';
import {
  type IGeocodingService,
  MapboxPermanentGeocodingUnavailableError,
  classifyGeocodingResult,
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
  BranchAddressNotVerifiedError,
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

    // Address write rules (X02-1 dec. 20, V-2 dec. V10):
    // - address absent: do not touch address_json or the marker.
    // - address unchanged (isSameGeocodingAddress) and marker present: keep the
    //   stored coordinates (copy them into the new JSON) and the marker, no Mapbox.
    // - address CHANGED: geocode in permanent mode. Accepted (rule A) → write coords
    //   + marker=now. Rejected (null/coarse/low-relevance) → 422 ADDRESS_NOT_VERIFIED,
    //   nothing written (V-2; branches have no manual pin). Timeout/transient/account
    //   error → write the JSON WITHOUT coords and a null marker (V4).
    // - address unchanged with a NULL marker (legacy / pre-X02 / #1394 saved without
    //   coords): try to geocode. Accepted → add coords + marker. Rejected/null →
    //   save WITHOUT coords, NO error, so other fields stay editable (V10). Only an
    //   address that actually changed can be rejected.
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
        let coords: Awaited<ReturnType<typeof geocodeWithTimeout>> | undefined;
        let transientFailure = false;
        try {
          coords = await geocodeWithTimeout(
            this.geocodingService,
            formatGeocodingQuery(clean as unknown as GeocodableAddress),
          );
        } catch (err) {
          // V4: timeout / transient error / permanent-unavailable → save WITHOUT
          // coordinates (null marker), as before. A geocoding outage never fails the save.
          transientFailure = true;
          updateData.addressJson = clean;
          updateData.geocodedPermanentlyAt = null;
          if (err instanceof MapboxPermanentGeocodingUnavailableError) {
            this.logger?.error({ branchId, tenantId, code: err.code }, 'branch.geocode_permanent_unavailable');
          } else {
            this.logger?.warn(
              { branchId, tenantId, reason: err instanceof GeocodeTimeoutError ? 'timeout' : 'error' },
              'branch.geocode_failed_saved_without_coordinates',
            );
          }
        }
        if (!transientFailure) {
          const decision = coords
            ? classifyGeocodingResult(coords, (clean as unknown as GeocodableAddress).suburb)
            : null;
          if (coords && decision?.accepted) {
            updateData.addressJson = { ...clean, latitude: coords.lat, longitude: coords.lng };
            updateData.geocodedPermanentlyAt = new Date();
          } else if (!sameAddress) {
            // V-2: a CHANGED address that fails rule A is rejected on save (422,
            // nothing stored) — branches have no manual pin, so the escape is fixing
            // the text. Only a timeout/transient error saves without coords.
            throw new BranchAddressNotVerifiedError(
              decision && !decision.accepted ? decision.reason : 'NOT_FOUND',
            );
          } else {
            // V10: the address did NOT change (a legacy re-geocode of a row with a
            // null marker — pre-X02, or saved without coords by #1394). A rejected/
            // null result must never block an edit of other fields, so save WITHOUT
            // coordinates and no error, exactly as before V-2.
            updateData.addressJson = clean;
            updateData.geocodedPermanentlyAt = null;
            this.logger?.warn(
              { branchId, tenantId, reason: decision && !decision.accepted ? decision.reason : 'no_results' },
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
