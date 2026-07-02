import type { AuthContext, PropertyType } from '@properfy/shared';
import {
  ForbiddenError,
  ValidationError,
} from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { Logger } from '../../../../shared/infrastructure/logger';
import type { IPropertyRepository } from '../../domain/property.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import type { IBranchRepository } from '../../../tenant/domain/branch.repository';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IGeocodingService } from '../../domain/geocoding.service';
import { PropertyEntity } from '../../domain/property.entity';
import { PropertyCodeConflictError, PropertyAddressConflictError, TenantInactiveError, BranchInactiveError } from '../../domain/property.errors';
import { BranchNotFoundError, TenantNotFoundError } from '../../../tenant/domain/tenant.errors';
import { sendJob } from '../../../../shared/infrastructure/queue';

/**
 * Upper bound for the inline geocode at creation time. Mapbox typically answers
 * in well under a second; if it exceeds this we abandon the sync attempt, persist
 * the property as PENDING and let the async worker finish it (fallback path).
 */
const DEFAULT_SYNC_GEOCODE_TIMEOUT_MS = 4000;

export interface CreatePropertyInput {
  tenantId?: string;
  branchId?: string;
  propertyCode: string;
  type: PropertyType;
  street: string;
  addressLine2?: string;
  suburb: string;
  postcode: string;
  state: string;
  country: string;
  notes?: string;
  rulesJson?: Record<string, unknown>;
  actor: AuthContext;
}

export interface CreatePropertyOutput {
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

export class CreatePropertyUseCase {
  constructor(
    private readonly propertyRepo: IPropertyRepository,
    private readonly branchRepo: IBranchRepository,
    private readonly auditService: AuditService,
    private readonly tenantRepo?: ITenantRepository,
    private readonly authorizationService?: AuthorizationService,
    private readonly logger?: Logger,
    private readonly geocodingService?: IGeocodingService,
    private readonly syncGeocodeTimeoutMs: number = DEFAULT_SYNC_GEOCODE_TIMEOUT_MS,
  ) {}

  /**
   * Geocode within a bounded time. Resolves to coordinates (or null when the
   * address has no match). Rejects on transient error OR timeout — the caller
   * treats a rejection as "keep PENDING and finish via the async worker".
   */
  private async geocodeWithinTimeout(
    address: string,
  ): Promise<{ lat: number; lng: number } | null> {
    const service = this.geocodingService!;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('sync geocode timed out')),
        this.syncGeocodeTimeoutMs,
      );
    });
    const lookup = service.geocode(address);
    // If the timeout wins, the lookup promise may still settle later — handle its
    // rejection so it never surfaces as an unhandled rejection.
    lookup.catch(() => {});
    try {
      return await Promise.race([lookup, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async execute(input: CreatePropertyInput): Promise<CreatePropertyOutput> {
    const { actor } = input;

    // RBAC: AM/OP are cross-tenant and supply the target tenantId explicitly
    // (they have no own tenant scope). CL_ADMIN / CL_USER are tenant-scoped.
    let tenantId: string;
    if (actor.role === 'AM' || actor.role === 'OP') {
      if (!input.tenantId) {
        throw new ValidationError('tenantId is required');
      }
      tenantId = input.tenantId;
    } else if (actor.role === 'CL_ADMIN' || actor.role === 'CL_USER') {
      tenantId = actor.tenantId!;
    } else {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

    // CL_USER must have create_properties permission
    if (this.authorizationService) {
      this.authorizationService.assertClUserPermission(actor, 'create_properties');
    }

    // Validate tenant is ACTIVE
    if (this.tenantRepo) {
      const tenant = await this.tenantRepo.findById(tenantId);
      if (!tenant) {
        throw new TenantNotFoundError();
      }
      if (!tenant.isActive()) {
        throw new TenantInactiveError();
      }
    }

    // Validate branch if provided
    if (input.branchId) {
      const branch = await this.branchRepo.findById(input.branchId, tenantId);
      if (!branch) {
        throw new BranchNotFoundError();
      }
      if (!branch.isActive()) {
        throw new BranchInactiveError();
      }
    }

    // Check propertyCode uniqueness within tenant
    const existing = await this.propertyRepo.findByPropertyCode(
      input.propertyCode,
      tenantId,
    );
    if (existing) {
      throw new PropertyCodeConflictError();
    }

    // Check address uniqueness within tenant (backed by the
    // `properties_normalized_address_active_unique` partial unique index —
    // this pre-check turns a DB constraint violation into a clean 409
    // instead of an uncaught P2002 surfacing as a 500).
    const existingByAddress = await this.propertyRepo.findByNormalizedAddress(tenantId, {
      street: input.street,
      addressLine2: input.addressLine2 ?? null,
      suburb: input.suburb,
      state: input.state,
      postcode: input.postcode,
    });
    if (existingByAddress) {
      throw new PropertyAddressConflictError();
    }

    const now = new Date();
    const id = crypto.randomUUID();

    const property = new PropertyEntity({
      id,
      tenantId,
      branchId: input.branchId ?? null,
      propertyCode: input.propertyCode,
      type: input.type,
      street: input.street,
      addressLine2: input.addressLine2 ?? null,
      suburb: input.suburb,
      postcode: input.postcode,
      state: input.state,
      country: input.country,
      lat: null,
      lng: null,
      geocodingStatus: 'PENDING',
      notes: input.notes ?? null,
      rulesJson: input.rulesJson ?? {},
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // Geocode synchronously so the property has coordinates the instant creation
    // returns (no dependency on the async queue in the happy path). On timeout or
    // transient error we keep PENDING and let the async worker finish it.
    if (this.geocodingService) {
      try {
        const result = await this.geocodeWithinTimeout(property.fullAddress);
        property.applyGeocodingResult(result);
      } catch (err) {
        this.logger?.warn({ propertyId: id, err }, 'property.sync_geocode_failed_falling_back');
        // property stays PENDING — async fallback below
      }
    }

    await this.propertyRepo.save(property);

    // Only enqueue the async geocode when the sync attempt did not resolve a
    // status (PENDING). SUCCESS/FAILED are terminal here and need no job.
    if (property.geocodingStatus === 'PENDING') {
      sendJob('property.geocode', { propertyId: id }, { retryLimit: 6, retryBackoff: true }).catch((err) => {
        // Geocoding is async — a queue failure must NOT fail property creation. But don't swallow it
        // silently: log so a lost enqueue is diagnosable. The geocode-retry sweep re-enqueues stale
        // PENDING properties (no coordinates) as the safety net that eventually heals this.
        this.logger?.error({ propertyId: id, err }, 'property.geocode_enqueue_failed');
      });
    }

    this.auditService.log({
      action: 'property.created',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Property',
      entityId: id,
      tenantId,
      after: {
        id,
        propertyCode: property.propertyCode,
        type: property.type,
        street: property.street,
        suburb: property.suburb,
        state: property.state,
        country: property.country,
      },
    });

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
      geocodingStatus: property.geocodingStatus,
      latitude: property.lat,
      longitude: property.lng,
      notes: property.notes,
      rulesJson: property.rulesJson,
      createdAt: property.createdAt,
      updatedAt: property.updatedAt,
    };
  }
}
