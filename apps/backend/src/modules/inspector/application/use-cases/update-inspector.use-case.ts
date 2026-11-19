import type {
  AuthContext,
  PaymentSettings,
  ServiceTypeEntry,
  UserStatus,
  InspectorBaseAddress,
} from '@properfy/shared';
import { inspectorBaseAddressSchema } from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IInspectorRepository } from '../../domain/inspector.repository';
import type { IServiceRegionRepository } from '../../../service-region/domain/service-region.repository';
import type { IUserManagementRepository } from '../../../user/domain/user-management.repository';
import type { IGeocodingService } from '../../../property/domain/geocoding.service';
import type { DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import type { Logger } from '../../../../shared/infrastructure/logger';
import { type Clock, SystemClock } from '../../../../shared/domain/clock';
import { isSameGeocodingAddress, type GeocodableAddress } from '../../../../shared/domain/geocoding-address';
import { geocodeInspectorBase } from '../services/geocode-inspector-base';
import { INSPECTOR_EVENTS } from '../../domain/inspector-events';
import {
  InspectorNotFoundError,
  InspectorEmailConflictError,
} from '../../domain/inspector.errors';

export interface UpdateInspectorInput {
  inspectorId: string;
  data: {
    name?: string;
    email?: string;
    phone?: string | null;
    status?: string;
    paymentSettings?: PaymentSettings;
    regions?: string[];
    regionIds?: string[];
    serviceTypes?: ServiceTypeEntry[];
    blockedClients?: string[];
    fullName?: string | null;
    address?: Record<string, unknown> | null;
    abn?: string | null;
    dateOfBirth?: string | null;
    insuranceFileKey?: string | null;
    insuranceExpiresAt?: string | null;
    policeCheckFileKey?: string | null;
    policeCheckExpiresAt?: string | null;
  };
  actor: AuthContext;
}

export interface UpdateInspectorOutput {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: string;
  paymentSettingsJson: PaymentSettings;
  regionIds: string[];
  serviceTypesJson: ServiceTypeEntry[];
  /** Present only when `address` was supplied; true when geocoding did not locate it. */
  baseGeocodeFailed?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class UpdateInspectorUseCase {
  constructor(
    private readonly inspectorRepo: IInspectorRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly serviceRegionRepo?: IServiceRegionRepository,
    private readonly userManagementRepo?: IUserManagementRepository,
    // Optional and LAST so existing wirings and untyped test constructors keep
    // compiling. A geocoding failure never fails the update.
    private readonly geocodingService?: IGeocodingService,
    private readonly eventBus?: DomainEventBus,
    private readonly logger?: Logger,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  /**
   * Optional only because it sits after two pre-existing optional params, which
   * TypeScript will not let a required one follow. Keeping the login-account sync
   * behind a silent `&& this.userManagementRepo` would let a future construction
   * that omits it ship deactivation-without-lockout, so fail loudly instead.
   */
  private requireUserManagementRepo(): IUserManagementRepository {
    if (!this.userManagementRepo) {
      throw new Error(
        'UpdateInspectorUseCase requires userManagementRepo to sync the inspector login account',
      );
    }
    return this.userManagementRepo;
  }

  async execute(input: UpdateInspectorInput): Promise<UpdateInspectorOutput> {
    const { inspectorId, data, actor } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], {
      action: 'inspector.update',
      entityType: 'Inspector',
    });

    const inspector = await this.inspectorRepo.findById(inspectorId);
    if (!inspector || inspector.isDeleted()) {
      throw new InspectorNotFoundError();
    }

    // Both uniqueness checks below are payload-gated with a self-exclusion, on
    // purpose: two different gate shapes on adjacent checks is what produced a
    // run of "fix one cell, break another" regressions here. Keep them symmetric.
    //
    // inspectors.email is @unique, so a diff gate let a legacy mixed-case row
    // resubmit its own normalised address, read as unchanged, skip the check and
    // drive the write into a P2002 — a 500 on a phone-only edit rather than a 409.
    if (data.email !== undefined) {
      const existing = await this.inspectorRepo.findByEmail(data.email);
      if (existing && existing.id !== inspectorId) {
        throw new InspectorEmailConflictError();
      }
    }

    // Gated exactly like the sync write below — payload-driven, and only when
    // there is a login account to protect. Both halves matter:
    //   - payload rather than diff, because for a legacy mixed-case row the
    //     normalised email reads as unchanged, so a diff gate would skip the check
    //     while the write still drove straight into the partial unique index on
    //     users.email — a P2002 500 instead of a 409 (that index is real but not
    //     declared in schema.prisma, which shows only @@index([email]));
    //   - only when linked, because the self-match exclusion keys on
    //     inspector.userId, so for an unlinked row it can never match and any
    //     unrelated user holding that address would 409 every future edit — with
    //     no sync happening that could have caused a conflict in the first place.
    if (data.email !== undefined && inspector.userId) {
      const existingUser = await this.userManagementRepo?.findByEmail(data.email);
      if (existingUser && existingUser.id !== inspector.userId) {
        throw new InspectorEmailConflictError();
      }
    }

    const before = {
      name: inspector.name,
      email: inspector.email,
      phone: inspector.phone,
      status: inspector.status,
      paymentSettingsJson: inspector.paymentSettingsJson,
      serviceTypesJson: inspector.serviceTypesJson,
      // Base-address audit WITHOUT raw coordinates (L-F01-10 / root §7.9).
      address: inspector.address,
      baseLocated: inspector.baseLat !== null,
      baseGeocodedAt: inspector.baseGeocodedAt,
    };

    // Build update payload
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.paymentSettings !== undefined) updateData.paymentSettingsJson = data.paymentSettings;
    if (data.serviceTypes !== undefined) updateData.serviceTypesJson = data.serviceTypes;
    if (data.blockedClients !== undefined) updateData.blockedClientsJson = data.blockedClients;
    if (data.fullName !== undefined) updateData.fullName = data.fullName;

    // F01-1: base address — geocode BEFORE the write so one `update` carries the
    // address and its coordinates together (L-F01-11). A failure clears the pair.
    let baseGeocodeFailed = false;
    let baseChanged = false;
    const hadCoordinates = inspector.baseLat !== null;
    let hasCoordinates = hadCoordinates;
    if (data.address !== undefined) {
      const next = data.address as unknown as InspectorBaseAddress;
      updateData.address = data.address;
      baseChanged = true;

      // "Same address" (D18, L-F01-01): only when the CURRENT stored address parses
      // under the AU schema (a legacy shape always re-geocodes), the two are equal
      // for geocoding via the X02 helper, and coordinates already exist.
      const currentParsed = inspectorBaseAddressSchema.safeParse(inspector.address);
      const sameAsStored =
        currentParsed.success &&
        hadCoordinates &&
        isSameGeocodingAddress(
          currentParsed.data as unknown as GeocodableAddress,
          next as unknown as GeocodableAddress,
        );

      if (sameAsStored) {
        baseChanged = false; // keep the coordinates, call nothing, emit nothing
      } else if (this.geocodingService) {
        const geo = await geocodeInspectorBase(this.geocodingService, next, this.logger, this.clock);
        if ('lat' in geo) {
          updateData.baseLat = geo.lat;
          updateData.baseLng = geo.lng;
          updateData.baseGeocodedAt = geo.geocodedAt;
          hasCoordinates = true;
        } else {
          updateData.baseLat = null;
          updateData.baseLng = null;
          updateData.baseGeocodedAt = null;
          baseGeocodeFailed = true;
          hasCoordinates = false;
        }
      } else {
        updateData.baseLat = null;
        updateData.baseLng = null;
        updateData.baseGeocodedAt = null;
        hasCoordinates = false;
      }
    }
    if (data.abn !== undefined) updateData.abn = data.abn;
    if (data.dateOfBirth !== undefined)
      updateData.dateOfBirth = data.dateOfBirth ? new Date(data.dateOfBirth) : null;
    if (data.insuranceFileKey !== undefined) updateData.insuranceFileKey = data.insuranceFileKey;
    if (data.insuranceExpiresAt !== undefined)
      updateData.insuranceExpiresAt = data.insuranceExpiresAt ? new Date(data.insuranceExpiresAt) : null;
    if (data.policeCheckFileKey !== undefined) updateData.policeCheckFileKey = data.policeCheckFileKey;
    if (data.policeCheckExpiresAt !== undefined)
      updateData.policeCheckExpiresAt = data.policeCheckExpiresAt ? new Date(data.policeCheckExpiresAt) : null;

    await this.inspectorRepo.update(inspectorId, updateData);

    // Keep the login account in step. Both syncs are driven off the supplied
    // payload rather than off "did the inspector row change", so a retry after a
    // failed users write still repairs the divergence — the inspector row already
    // carries the new value by then, which would make a diff-based check skip the
    // sync forever while returning 200.
    if (inspector.userId) {
      // status here is the inspector-update payload's validated status; the
      // user-management repo types it as UserStatus (#552).
      const userUpdate: { email?: string; status?: UserStatus } = {};

      // Otherwise the UI shows the new address while authentication still expects
      // the old one, and PWA forgot-password silently no-ops on the unknown email.
      if (data.email !== undefined) {
        userUpdate.email = data.email;
      }

      // This route accepts `status` alongside the dedicated deactivate endpoint.
      // Without syncing, INACTIVE here leaves a fully usable login, and ACTIVE
      // never lifts the block that /deactivate applied — leaving a reactivated
      // inspector assignable but permanently unable to log in.
      if (data.status !== undefined) {
        userUpdate.status = data.status as UserStatus;
      }

      if (Object.keys(userUpdate).length > 0) {
        await this.requireUserManagementRepo().update(inspector.userId, null, userUpdate);
      }

      // Payload-gated like the write above, not diff-gated: revoking is idempotent
      // (it only touches sessions with revoked_at IS NULL), and a diff gate left
      // the revoke stranded on a retry — the status write would heal while live
      // sessions survived on an account already marked INACTIVE.
      if (userUpdate.status === 'INACTIVE') {
        await this.requireUserManagementRepo().revokeAllSessions(inspector.userId);
      }
    }

    // Update service region links if regionIds provided
    if (data.regionIds !== undefined && this.serviceRegionRepo) {
      await this.serviceRegionRepo.setInspectorRegions(inspectorId, data.regionIds);
    }

    const resolvedRegionIds = this.serviceRegionRepo
      ? await this.serviceRegionRepo.getInspectorRegionIds(inspectorId)
      : [];

    // Gate on key-presence, not `??`: an explicit `null` clear (e.g. phone) is a
    // real change and must be reflected in both the audit `after` and the response,
    // not silently rewritten to the previous value. `updateData` carries a key only
    // when the field was supplied, so `in` distinguishes "cleared" from "untouched".
    const after = {
      name: 'name' in updateData ? (updateData.name as string) : inspector.name,
      email: 'email' in updateData ? (updateData.email as string) : inspector.email,
      phone: 'phone' in updateData ? (updateData.phone as string | null) : inspector.phone,
      status: (updateData.status as string) ?? inspector.status,
      paymentSettingsJson:
        'paymentSettingsJson' in updateData
          ? (updateData.paymentSettingsJson as PaymentSettings)
          : inspector.paymentSettingsJson,
      regionIds: resolvedRegionIds,
      serviceTypesJson:
        'serviceTypesJson' in updateData
          ? (updateData.serviceTypesJson as ServiceTypeEntry[])
          : inspector.serviceTypesJson,
      address: 'address' in updateData ? (updateData.address as Record<string, unknown> | null) : inspector.address,
      baseLocated: hasCoordinates,
      baseGeocodedAt:
        'baseGeocodedAt' in updateData
          ? (updateData.baseGeocodedAt as Date | null)
          : inspector.baseGeocodedAt,
    };

    this.auditService.log({
      action: 'inspector.updated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Inspector',
      entityId: inspectorId,
      before,
      after,
    });

    // Emit after the write, only when the base was actually changed (not on a
    // "same address" no-op). A throwing subscriber must not fail the response.
    if (baseChanged && this.eventBus) {
      try {
        await this.eventBus.emit({
          type: INSPECTOR_EVENTS.BASE_CHANGED,
          payload: { inspectorId, hadCoordinates, hasCoordinates },
          occurredAt: new Date(),
        });
      } catch (err) {
        this.logger?.warn(
          { inspectorId, err: err instanceof Error ? err.message : String(err) },
          'inspector.base_changed_emit_failed',
        );
      }
    }

    return {
      id: inspector.id,
      name: after.name,
      email: after.email,
      phone: after.phone,
      status: after.status,
      paymentSettingsJson: after.paymentSettingsJson,
      regionIds: after.regionIds,
      serviceTypesJson: after.serviceTypesJson,
      ...(data.address !== undefined ? { baseGeocodeFailed } : {}),
      createdAt: inspector.createdAt,
      updatedAt: new Date(),
    };
  }
}
