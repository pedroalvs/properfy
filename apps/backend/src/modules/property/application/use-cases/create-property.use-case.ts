import type { AuthContext, PropertyType } from '@properfy/shared';
import {
  ForbiddenError,
  ValidationError,
} from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IPropertyRepository } from '../../domain/property.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import type { IBranchRepository } from '../../../tenant/domain/branch.repository';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { PropertyEntity } from '../../domain/property.entity';
import { PropertyCodeConflictError, TenantInactiveError, BranchInactiveError } from '../../domain/property.errors';
import { BranchNotFoundError, TenantNotFoundError } from '../../../tenant/domain/tenant.errors';
import { sendJob } from '../../../../shared/infrastructure/queue';

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
  ) {}

  async execute(input: CreatePropertyInput): Promise<CreatePropertyOutput> {
    const { actor } = input;

    // RBAC: AM/OP can create for any tenant, CL_ADMIN/CL_USER for own tenant
    let tenantId: string;
    if (actor.role === 'AM' || actor.role === 'OP') {
      if (!input.tenantId) {
        throw new ValidationError('tenantId is required for AM/OP roles');
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

    await this.propertyRepo.save(property);

    sendJob('property.geocode', { propertyId: id }, { retryLimit: 6, retryBackoff: true }).catch(() => {
      // Geocoding is async — queue failure does not fail property creation.
      // The property stays PENDING and can be re-queued later.
    });

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
