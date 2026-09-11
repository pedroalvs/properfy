import type {
  AuthContext,
  PaymentSettings,
  ServiceTypeEntry,
} from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IInspectorRepository } from '../../domain/inspector.repository';
import type { IServiceRegionRepository } from '../../../service-region/domain/service-region.repository';
import type { IUserManagementRepository } from '../../../user/domain/user-management.repository';
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
    };

    // Build update payload
    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.paymentSettings !== undefined) updateData.paymentSettingsJson = data.paymentSettings;
    if (data.serviceTypes !== undefined) updateData.serviceTypesJson = data.serviceTypes;
    if (data.blockedClients !== undefined) updateData.blockedClientsJson = data.blockedClients;
    if (data.fullName !== undefined) updateData.fullName = data.fullName;
    if (data.address !== undefined) updateData.address = data.address;
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

    // Keep the login email in step. Lifecycle status is deliberately NOT synced
    // here: activation/deactivation (and the session revocation it entails) belong
    // exclusively to the deactivate/reactivate flow, which owns the lockout and
    // audit semantics. Driven off the supplied payload, not a diff, so a retry
    // after a failed users write still repairs the divergence.
    if (inspector.userId && data.email !== undefined) {
      // Otherwise the UI shows the new address while authentication still expects
      // the old one, and PWA forgot-password silently no-ops on the unknown email.
      await this.requireUserManagementRepo().update(inspector.userId, null, {
        email: data.email,
      });
    }

    // Update service region links if regionIds provided
    if (data.regionIds !== undefined && this.serviceRegionRepo) {
      await this.serviceRegionRepo.setInspectorRegions(inspectorId, data.regionIds);
    }

    const resolvedRegionIds = this.serviceRegionRepo
      ? await this.serviceRegionRepo.getInspectorRegionIds(inspectorId)
      : [];

    const after = {
      name: (updateData.name as string) ?? inspector.name,
      email: (updateData.email as string) ?? inspector.email,
      phone: (updateData.phone as string | null) ?? inspector.phone,
      // Status is never mutated by this path; always echo the current value.
      status: inspector.status,
      paymentSettingsJson: (updateData.paymentSettingsJson as PaymentSettings) ?? inspector.paymentSettingsJson,
      regionIds: resolvedRegionIds,
      serviceTypesJson: (updateData.serviceTypesJson as ServiceTypeEntry[]) ?? inspector.serviceTypesJson,
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

    return {
      id: inspector.id,
      name: after.name,
      email: after.email,
      phone: after.phone,
      status: after.status,
      paymentSettingsJson: after.paymentSettingsJson,
      regionIds: after.regionIds,
      serviceTypesJson: after.serviceTypesJson,
      createdAt: inspector.createdAt,
      updatedAt: new Date(),
    };
  }
}
