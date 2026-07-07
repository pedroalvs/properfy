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
import { PropertyCodeFormatter } from '../../domain/property-code.formatter';
import { PropertyCodeConflictError, PropertyAddressConflictError, TenantInactiveError, BranchInactiveError } from '../../domain/property.errors';
import { BranchNotFoundError, TenantNotFoundError } from '../../../tenant/domain/tenant.errors';
import { sendJob } from '../../../../shared/infrastructure/queue';

/**
 * Upper bound for the inline geocode at creation time. Mapbox typically answers
 * in well under a second; if it exceeds this we abandon the sync attempt, persist
 * the property as PENDING and let the async worker finish it (fallback path).
 */
const DEFAULT_SYNC_GEOCODE_TIMEOUT_MS = 4000;

/**
 * Attempts for the generate-number + insert cycle. `nextPropertyNumber` is
 * MAX+1 and therefore racy under concurrent creates — the per-tenant unique
 * index turns the loser into a PropertyCodeConflictError, which we retry with
 * a freshly read number.
 */
const MAX_CODE_GENERATION_ATTEMPTS = 3;

export interface CreatePropertyInput {
  tenantId?: string;
  branchId?: string;
  type: PropertyType;
  apartmentNumber?: string;
  street: string;
  addressLine2?: string;
  suburb: string;
  postcode: string;
  state: string;
  country: string;
  privateAreaM2?: number;
  totalAreaM2?: number;
  furnished?: boolean;
  linenProvided?: boolean;
  rentAmount?: number;
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

    // Validate tenant is ACTIVE; its code prefix feeds the generated property code.
    let codePrefix: string | null = null;
    if (this.tenantRepo) {
      const tenant = await this.tenantRepo.findById(tenantId);
      if (!tenant) {
        throw new TenantNotFoundError();
      }
      if (!tenant.isActive()) {
        throw new TenantInactiveError();
      }
      codePrefix = tenant.appointmentCodePrefix ?? null;
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

    const buildProperty = (propertyNumber: number): PropertyEntity =>
      new PropertyEntity({
        id,
        tenantId,
        branchId: input.branchId ?? null,
        propertyCode: PropertyCodeFormatter.formatParts(propertyNumber, codePrefix),
        propertyNumber,
        type: input.type,
        apartmentNumber: input.apartmentNumber ?? null,
        street: input.street,
        addressLine2: input.addressLine2 ?? null,
        suburb: input.suburb,
        postcode: input.postcode,
        state: input.state,
        country: input.country,
        lat: null,
        lng: null,
        geocodingStatus: 'PENDING',
        privateAreaM2: input.privateAreaM2 ?? null,
        totalAreaM2: input.totalAreaM2 ?? null,
        furnished: input.furnished ?? null,
        linenProvided: input.linenProvided ?? null,
        rentAmount: input.rentAmount ?? null,
        notes: input.notes ?? null,
        rulesJson: input.rulesJson ?? {},
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });

    // Geocode synchronously (once — the address never changes across code-retry
    // attempts) so the property has coordinates the instant creation returns.
    // On timeout or transient error we keep PENDING and let the async worker
    // finish it. `undefined` = keep PENDING; null/coords = terminal outcome.
    let geocodeOutcome: { lat: number; lng: number } | null | undefined;
    if (this.geocodingService) {
      try {
        geocodeOutcome = await this.geocodeWithinTimeout(buildProperty(0).fullAddress);
      } catch (err) {
        this.logger?.warn({ propertyId: id, err }, 'property.sync_geocode_failed_falling_back');
        // property stays PENDING — async fallback below
      }
    }

    // Generate the per-tenant sequential code and insert, retrying when a
    // concurrent create wins the same number (unique-index race).
    let property: PropertyEntity | undefined;
    for (let attempt = 1; attempt <= MAX_CODE_GENERATION_ATTEMPTS; attempt++) {
      const nextNumber = await this.propertyRepo.nextPropertyNumber(tenantId);
      const candidate = buildProperty(nextNumber);
      if (geocodeOutcome !== undefined) {
        candidate.applyGeocodingResult(geocodeOutcome);
      }
      try {
        await this.propertyRepo.save(candidate);
        property = candidate;
        break;
      } catch (err) {
        if (err instanceof PropertyCodeConflictError && attempt < MAX_CODE_GENERATION_ATTEMPTS) {
          this.logger?.warn(
            { tenantId, propertyNumber: nextNumber, attempt },
            'property.code_generation_conflict_retrying',
          );
          continue;
        }
        throw err;
      }
    }
    if (!property) {
      throw new PropertyCodeConflictError();
    }

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
      apartmentNumber: property.apartmentNumber,
      street: property.street,
      addressLine2: property.addressLine2,
      suburb: property.suburb,
      postcode: property.postcode,
      state: property.state,
      country: property.country,
      geocodingStatus: property.geocodingStatus,
      latitude: property.lat,
      longitude: property.lng,
      privateAreaM2: property.privateAreaM2,
      totalAreaM2: property.totalAreaM2,
      furnished: property.furnished,
      linenProvided: property.linenProvided,
      rentAmount: property.rentAmount,
      notes: property.notes,
      rulesJson: property.rulesJson,
      createdAt: property.createdAt,
      updatedAt: property.updatedAt,
    };
  }
}
