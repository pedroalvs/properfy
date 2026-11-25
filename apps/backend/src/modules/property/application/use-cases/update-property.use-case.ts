import type { AuthContext, PropertyType } from '@properfy/shared';
import { ForbiddenError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { IPropertyRepository } from '../../domain/property.repository';
import type { IBranchRepository } from '../../../tenant/domain/branch.repository';
import {
  PropertyNotFoundError,
  PropertyAddressConflictError,
  BranchInactiveError,
  PropertyAddressNotVerifiedError,
} from '../../domain/property.errors';
import { BranchNotFoundError } from '../../../tenant/domain/tenant.errors';
import type { IGeocodingService, GeocodingResult } from '../../domain/geocoding.service';
import { classifyGeocodingResult } from '../../domain/geocoding.service';
import { propertyFullAddress } from '../../domain/property.entity';
import { geocodeWithTimeout, GEOCODE_SYNC_TIMEOUT_MS } from '../services/geocode-with-timeout';
import { sendJob } from '../../../../shared/infrastructure/queue';
import { isSameGeocodingAddress, type GeocodableAddress } from '../../../../shared/domain/geocoding-address';

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

export class UpdatePropertyUseCase {
  constructor(
    private readonly propertyRepo: IPropertyRepository,
    private readonly branchRepo: IBranchRepository,
    private readonly auditService: AuditService,
    private readonly logger?: Logger,
    private readonly geocodingService?: IGeocodingService,
    private readonly syncGeocodeTimeoutMs: number = GEOCODE_SYNC_TIMEOUT_MS,
  ) {}

  /** Compare an incoming coordinate against a stored one at 7 decimal places
   * (the Decimal(10,7) column precision), normalizing Prisma Decimal→number drift. */
  private sameCoordinate(incoming: number, stored: number | null): boolean {
    return stored !== null && Number(incoming.toFixed(7)) === Number(stored.toFixed(7));
  }

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
    // apartmentNumber is only meaningful for apartments: force-null it when the
    // effective type is not APARTMENT, regardless of what the caller sent.
    const effectiveType = data.type ?? property.type;
    if (effectiveType !== 'APARTMENT') {
      if (data.apartmentNumber !== undefined || data.type !== undefined) {
        updateData.apartmentNumber = null;
      }
    } else if (data.apartmentNumber !== undefined) {
      updateData.apartmentNumber = data.apartmentNumber;
    }
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

    // Whether the geocoding address actually CHANGED vs the stored one (V10 fix,
    // mirrors update-branch/update-inspector). The property form always re-sends
    // the pre-filled address fields, so "some field present in the body" is true on
    // every screen edit — using that as `addressChanged` re-geocoded (and could 422)
    // an unchanged address. Compare the effective address to the stored one via the
    // shared `isSameGeocodingAddress` helper (street, addressLine2, suburb, state,
    // postcode, country) instead.
    const storedAddress: GeocodableAddress = {
      street: property.street,
      addressLine2: property.addressLine2,
      suburb: property.suburb,
      state: property.state,
      postcode: property.postcode,
      country: property.country,
    };
    const effectiveGeoAddress: GeocodableAddress = {
      street: data.street ?? property.street,
      addressLine2: data.addressLine2 !== undefined ? data.addressLine2 : property.addressLine2,
      suburb: data.suburb ?? property.suburb,
      state: data.state ?? property.state,
      postcode: data.postcode ?? property.postcode,
      country: data.country ?? property.country,
    };
    const addressChanged = !isSameGeocodingAddress(storedAddress, effectiveGeoAddress);
    // Whether the request BODY carried any address field (the form re-sends them).
    // Used only to scope the unlocated-recovery re-enqueue to an address re-send,
    // exactly as pre-V-1 did — a notes-only edit of a FAILED row must not re-geocode.
    const addressPresentInBody = ['street', 'addressLine2', 'suburb', 'postcode', 'state', 'country'].some(
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

    // Coordinate handling (X02-1). Invariant: never write MANUAL with a null
    // coordinate. A latitude/longitude in an update body is USER input — stored
    // as MANUAL only when the pair differs from the stored pair; equal or
    // null/incomplete pairs are ignored (the autocomplete form over-sends them).
    const latProvided = data.latitude !== undefined;
    const lngProvided = data.longitude !== undefined;
    const bothNonNull =
      latProvided && lngProvided && data.latitude !== null && data.longitude !== null;
    const bothNull =
      latProvided && lngProvided && data.latitude === null && data.longitude === null;

    let manualSet = false;
    let statusToPending = false;

    if (bothNonNull) {
      if (
        this.sameCoordinate(data.latitude!, property.lat) &&
        this.sameCoordinate(data.longitude!, property.lng)
      ) {
        // Unchanged coordinates (the form re-sent the stored pair): keep status,
        // coordinates and marker as they are.
        this.logger?.debug({ propertyId }, 'property.update_coordinates_unchanged_ignored');
      } else {
        updateData.lat = data.latitude;
        updateData.lng = data.longitude;
        updateData.geocodingStatus = 'MANUAL';
        updateData.geocodedPermanentlyAt = null;
        // A user coordinate supersedes any prior failure (e.g. a blocked FAILED):
        // clear the code so no stale value lingers on a MANUAL row.
        updateData.geocodingFailureCode = null;
        manualSet = true;
      }
    } else if (bothNull) {
      if (property.geocodingStatus === 'MANUAL') {
        // Unlock a MANUAL property: clear the coordinates and re-geocode.
        updateData.lat = null;
        updateData.lng = null;
        updateData.geocodingStatus = 'PENDING';
        updateData.geocodedPermanentlyAt = null;
        updateData.geocodingFailureCode = null;
        statusToPending = true;
      } else {
        // null/null on a non-MANUAL property is ignored (never MANUAL-without-coord).
        this.logger?.debug(
          { propertyId, geocodingStatus: property.geocodingStatus },
          'property.update_coordinates_null_ignored',
        );
      }
    }
    // An incomplete pair (one field present, the other absent or null) is ignored
    // entirely — handled by falling through neither branch above.

    // Geocoding on update (V-1 + V10). Three cases, when no MANUAL pin was just set:
    //   - address CHANGED → geocode SYNCHRONOUSLY and validate (rule A) before
    //     writing: accepted → coords + SUCCESS now; rejected/null → 422, nothing
    //     written; timeout/transient error (or no geocoder wired) → keep PENDING and
    //     let the async worker finish it (V4 "provider down").
    //   - address UNCHANGED but the property is UNLOCATED (FAILED/PENDING, e.g. a
    //     legacy row or a prior outage) → do NOT call the sync geocoder and NEVER
    //     422; instead re-enqueue the async geocode worker as a recovery attempt.
    //     This is exactly the PRE-V-1 behavior for an address-present edit (PENDING
    //     + property.geocode job) and keeps the edit of other fields unblocked (V10).
    //   - address UNCHANGED and LOCATED (SUCCESS/MANUAL) → do NOTHING: keep the
    //     stored coordinates + marker, call no geocoder (the common screen edit).
    if (!manualSet && addressChanged) {
      updateData.geocodedPermanentlyAt = null;
      updateData.geocodingFailureCode = null;

      const query = propertyFullAddress({
        street: data.street ?? property.street,
        addressLine2: data.addressLine2 !== undefined ? data.addressLine2 : property.addressLine2,
        suburb: data.suburb ?? property.suburb,
        state: data.state ?? property.state,
        postcode: data.postcode ?? property.postcode,
        country: data.country ?? property.country,
      });

      let outcome: GeocodingResult | null | undefined;
      if (this.geocodingService) {
        try {
          outcome = await geocodeWithTimeout(this.geocodingService, query, {
            timeoutMs: this.syncGeocodeTimeoutMs,
          });
        } catch (err) {
          this.logger?.warn({ propertyId, err }, 'property.sync_geocode_failed_falling_back');
        }
      }

      if (outcome === null) {
        throw new PropertyAddressNotVerifiedError('NOT_FOUND');
      }
      if (outcome !== undefined) {
        const decision = classifyGeocodingResult(outcome);
        if (!decision.accepted) {
          throw new PropertyAddressNotVerifiedError(decision.reason);
        }
        updateData.lat = outcome.lat;
        updateData.lng = outcome.lng;
        updateData.geocodingStatus = 'SUCCESS';
        updateData.geocodedPermanentlyAt = new Date();
      } else {
        updateData.geocodingStatus = 'PENDING';
        statusToPending = true;
      }
    } else if (
      !manualSet &&
      addressPresentInBody &&
      (property.geocodingStatus === 'FAILED' || property.geocodingStatus === 'PENDING')
    ) {
      // Address RE-SENT unchanged on an unlocated property: preserve the pre-V-1
      // async recovery (PENDING + property.geocode job). Never blocks the edit,
      // never a 422, never calls the sync geocoder. Gated on addressPresentInBody so
      // a notes-only edit of a FAILED row still does nothing, exactly as pre-V-1.
      updateData.geocodingStatus = 'PENDING';
      updateData.geocodedPermanentlyAt = null;
      updateData.geocodingFailureCode = null;
      statusToPending = true;
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

    // Any transition to PENDING (unlock or address change without a MANUAL
    // override) needs the async geocode job.
    if (statusToPending) {
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
        updateData.apartmentNumber !== undefined
          ? (updateData.apartmentNumber as string | null)
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
      // Reflect what was actually persisted, not the raw input: an ignored or
      // unchanged pair keeps the stored coordinates.
      latitude: updateData.lat !== undefined ? (updateData.lat as number | null) : (property.lat ?? null),
      longitude: updateData.lng !== undefined ? (updateData.lng as number | null) : (property.lng ?? null),
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
