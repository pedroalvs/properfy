import bcrypt from 'bcryptjs';
import type {
  AuthContext,
  PaymentSettings,
  ServiceTypeEntry,
  InspectorBaseAddress,
} from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IInspectorRepository } from '../../domain/inspector.repository';
import type { IUserManagementRepository } from '../../../user/domain/user-management.repository';
import type { IServiceRegionRepository } from '../../../service-region/domain/service-region.repository';
import type { IGeocodingService } from '../../../property/domain/geocoding.service';
import type { DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import type { Logger } from '../../../../shared/infrastructure/logger';
import { type Clock, SystemClock } from '../../../../shared/domain/clock';
import { InspectorEntity } from '../../domain/inspector.entity';
import { UserEntity } from '../../../auth/domain/user.entity';
import { InspectorEmailConflictError } from '../../domain/inspector.errors';
import { geocodeInspectorBase } from '../services/geocode-inspector-base';
import { INSPECTOR_EVENTS } from '../../domain/inspector-events';
import { validatePasswordStrength } from '../../../auth/domain/password-policy';
import {
  PasswordTooWeakError,
  PasswordTooCommonError,
} from '../../../auth/domain/auth.errors';
import { COMMON_PASSWORDS } from '../../../auth/application/constants/common-passwords';

export interface CreateInspectorInput {
  name: string;
  email: string;
  /** Set by the operator; hashed onto the inspector's INSP login account. */
  password: string;
  phone?: string | null;
  paymentSettings?: PaymentSettings;
  regions?: string[];
  regionIds?: string[];
  serviceTypes?: ServiceTypeEntry[];
  /** Mandatory base address (enforced by createInspectorSchema at the route). */
  address?: InspectorBaseAddress;
  actor: AuthContext;
}

export interface CreateInspectorOutput {
  id: string;
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  paymentSettingsJson: PaymentSettings;
  regionIds: string[];
  serviceTypesJson: ServiceTypeEntry[];
  address: Record<string, unknown> | null;
  baseLat: number | null;
  baseLng: number | null;
  baseGeocodedAt: Date | null;
  /** True when the address was saved but geocoding did not produce coordinates. */
  baseGeocodeFailed: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class CreateInspectorUseCase {
  constructor(
    private readonly inspectorRepo: IInspectorRepository,
    private readonly userManagementRepo: IUserManagementRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly serviceRegionRepo?: IServiceRegionRepository,
    // Optional and LAST so existing wirings and untyped test constructors keep
    // compiling (same pattern as the X02 branch use case). A geocoding failure
    // never fails the create.
    private readonly geocodingService?: IGeocodingService,
    private readonly eventBus?: DomainEventBus,
    private readonly logger?: Logger,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute(input: CreateInspectorInput): Promise<CreateInspectorOutput> {
    const { name, email, password, phone, paymentSettings, regionIds, serviceTypes, actor } = input;
    const address = input.address ?? null;

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'inspector.create',
      entityType: 'Inspector',
    });

    const existing = await this.inspectorRepo.findByEmail(email);
    if (existing) {
      throw new InspectorEmailConflictError();
    }

    // The email is also the login identity. `users_email_key` is a PARTIAL unique
    // index (WHERE deleted_at IS NULL) that schema.prisma does not declare — it
    // shows only @@index([email]) — so the database is the real backstop here and
    // this check exists to turn what would be a P2002 into a clean 409.
    const existingUser = await this.userManagementRepo.findByEmail(email);
    if (existingUser) {
      throw new InspectorEmailConflictError();
    }

    const strengthResult = validatePasswordStrength(password);
    if (!strengthResult.valid) {
      throw new PasswordTooWeakError(strengthResult.violations);
    }

    if (COMMON_PASSWORDS.has(password.toLowerCase())) {
      throw new PasswordTooCommonError();
    }

    // Geocode the base address BEFORE any write (L-F01-11): an unexpected error
    // here leaves neither a User nor an Inspector row. A geocode failure is not an
    // error — the address is saved without coordinates and baseGeocodeFailed = true.
    let baseLat: number | null = null;
    let baseLng: number | null = null;
    let baseGeocodedAt: Date | null = null;
    let baseGeocodeFailed = false;
    if (address && this.geocodingService) {
      const geo = await geocodeInspectorBase(this.geocodingService, address, this.logger, this.clock);
      if ('lat' in geo) {
        baseLat = geo.lat;
        baseLng = geo.lng;
        baseGeocodedAt = geo.geocodedAt;
      } else {
        baseGeocodeFailed = true;
      }
    }

    const now = new Date();
    const id = crypto.randomUUID();

    // Auto-create a User record for inspector authentication (role: INSP, no tenant)
    const userId = crypto.randomUUID();
    const passwordHash = await bcrypt.hash(password, 12);

    const user = new UserEntity({
      id: userId,
      tenantId: null,
      branchId: null,
      role: 'INSP',
      name,
      email,
      phone: phone ?? null,
      status: 'ACTIVE',
      passwordHash,
      totpSecret: null,
      totpEnabled: false,
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    await this.userManagementRepo.save(user);

    const inspector = new InspectorEntity({
      id,
      userId,
      name,
      email,
      phone: phone ?? null,
      status: 'ACTIVE',
      paymentSettingsJson: paymentSettings ?? {},
      serviceTypesJson: serviceTypes ?? [],
      blockedClientsJson: (input as any).blockedClients ?? [],
      fullName: (input as any).fullName ?? null,
      address,
      baseLat,
      baseLng,
      baseGeocodedAt,
      appInstalledAt: null,
      appLastSeenAt: null,
      pushEnabled: null,
      appVersion: null,
      abn: (input as any).abn ?? null,
      dateOfBirth: (input as any).dateOfBirth ? new Date((input as any).dateOfBirth) : null,
      insuranceFileKey: (input as any).insuranceFileKey ?? null,
      insuranceExpiresAt: (input as any).insuranceExpiresAt ? new Date((input as any).insuranceExpiresAt) : null,
      policeCheckFileKey: (input as any).policeCheckFileKey ?? null,
      policeCheckExpiresAt: (input as any).policeCheckExpiresAt ? new Date((input as any).policeCheckExpiresAt) : null,
      insuranceMetaJson: null,
      policeCheckMetaJson: null,
      photoStorageKey: null,
      availabilityTemplateJson: {},
      billingCycle: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // The user and inspector rows are written outside a shared transaction. An
    // orphan INSP user would hold a real, working password while being invisible
    // to the users list and unreachable by every read API — and the email check
    // above would then reject the retry forever. Compensate instead.
    //
    // Scoped to this one call on purpose: once the inspector row exists the pair
    // is consistent, and soft-deleting the user then would strand an inspector
    // whose user_id points at a deleted account — unreachable by link-user,
    // reset-password, or a re-create, with no DELETE route to clean it up.
    try {
      await this.inspectorRepo.save(inspector);
    } catch (error) {
      try {
        await this.userManagementRepo.update(userId, null, { deletedAt: new Date() });
      } catch (compensationError) {
        // The orphan survives and will block this email via the user-email check
        // above, so it has to leave a trace. Recorded rather than thrown so the
        // original cause still reaches the operator.
        this.auditService.log({
          action: 'inspector.create_compensation_failed',
          actorType: 'USER',
          actorId: actor.userId,
          entityType: 'User',
          entityId: userId,
          metadata: {
            email,
            originalError: error instanceof Error ? error.message : String(error),
            compensationError:
              compensationError instanceof Error
                ? compensationError.message
                : String(compensationError),
          },
        });
      }
      throw error;
    }

    // Outside the compensation: a failure here leaves a usable inspector that an
    // operator can finish setting up by editing its regions.
    if (regionIds && regionIds.length > 0 && this.serviceRegionRepo) {
      await this.serviceRegionRepo.setInspectorRegions(id, regionIds);
    }

    this.auditService.log({
      action: 'inspector.created',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Inspector',
      entityId: id,
      after: {
        id,
        name,
        email,
        phone: inspector.phone,
        status: 'ACTIVE',
        paymentSettingsJson: inspector.paymentSettingsJson,
        regionIds: regionIds ?? [],
        serviceTypesJson: inspector.serviceTypesJson,
        // Base-address audit WITHOUT raw coordinates (L-F01-10 / root §7.9).
        address,
        baseLocated: baseLat !== null,
        baseGeocodedAt,
      },
    });

    // Emit after the write, only when a base address was actually stored
    // (create always stores one). A throwing subscriber must not fail the 201.
    if (address !== null && this.eventBus) {
      try {
        await this.eventBus.emit({
          type: INSPECTOR_EVENTS.BASE_CHANGED,
          payload: { inspectorId: id, hadCoordinates: false, hasCoordinates: baseLat !== null },
          occurredAt: new Date(),
        });
      } catch (err) {
        this.logger?.warn(
          { inspectorId: id, err: err instanceof Error ? err.message : String(err) },
          'inspector.base_changed_emit_failed',
        );
      }
    }

    return {
      id: inspector.id,
      userId: inspector.userId!,
      name: inspector.name,
      email: inspector.email,
      phone: inspector.phone,
      status: inspector.status,
      paymentSettingsJson: inspector.paymentSettingsJson,
      regionIds: regionIds ?? [],
      serviceTypesJson: inspector.serviceTypesJson,
      address: inspector.address,
      baseLat: inspector.baseLat,
      baseLng: inspector.baseLng,
      baseGeocodedAt: inspector.baseGeocodedAt,
      baseGeocodeFailed,
      createdAt: inspector.createdAt,
      updatedAt: inspector.updatedAt,
    };
  }
}
