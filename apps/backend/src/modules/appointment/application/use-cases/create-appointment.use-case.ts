import { type AuthContext, type PropertyType } from '@properfy/shared';
import type { AppointmentContactRole, AppointmentApp, AppointmentCustomField } from '@properfy/shared';
import {
  NotFoundError,
  ValidationError,
} from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IIdempotencyService } from '../../../../shared/domain/idempotency.service';
import type { IAppointmentRepository } from '../../domain/appointment.repository';
import type { IBranchRepository } from '../../../tenant/domain/branch.repository';
import type { IPropertyRepository } from '../../../property/domain/property.repository';
import type { IServiceTypeRepository } from '../../../service-type/domain/service-type.repository';
import type { IPricingRuleRepository } from '../../../pricing-rule/domain/pricing-rule.repository';
import type { CreatePropertyUseCase } from '../../../property/application/use-cases/create-property.use-case';
import type { IContactRepository } from '../../../contact/domain/contact.repository';
import { ContactEntity } from '../../../contact/domain/contact.entity';
import { ContactNoChannelError } from '../../../contact/domain/contact.errors';
import type { IAppCredentialRepository } from '../../../app-credential/domain/app-credential.repository';
import { toAppointmentApp } from '../../../app-credential/application/appointment-app.mapper';
import { AppointmentEntity } from '../../domain/appointment.entity';
import { AppointmentContactEntity } from '../../domain/appointment-contact.entity';
import { AppointmentRestrictionEntity } from '../../domain/appointment-restriction.entity';
import {
  snapshotPricing,
  calculatePayoutAmount,
} from '../../domain/appointment-pricing.service';
import { resolvePricingRule } from '../../../pricing-rule/domain/resolve-pricing-rule';
import {
  AppointmentBranchNotFoundError,
  AppointmentBranchInactiveError,
  AppointmentPropertyNotFoundError,
  AppointmentPropertyTenantMismatchError,
  AppointmentServiceTypeNotFoundError,
  AppointmentServiceTypeInactiveError,
  AppointmentNoPriceRuleError,
  AppointmentDateInPastError,
  AppointmentTimeInPastError,
} from '../../domain/appointment.errors';
import { validateNewSchedule } from '@properfy/shared';
import type { RestrictionSource } from '@properfy/shared';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { SystemClock, type Clock } from '../../../../shared/domain/clock';

export interface CreateAppointmentInput {
  branchId: string;
  propertyId?: string;
  property?: {
    type: PropertyType;
    apartmentNumber?: string;
    street: string;
    addressLine2?: string;
    suburb: string;
    postcode: string;
    state: string;
    country: string;
    notes?: string;
  };
  serviceTypeId: string;
  scheduledDate: string; // YYYY-MM-DD
  timeSlotStart: string; // HH:mm
  timeSlotEnd: string; // HH:mm
  /** @deprecated Use contacts array instead */
  contact?: {
    rentalTenantName: string;
    primaryEmail?: string;
    primaryPhone?: string;
  };
  /** New contacts array format (feature 021) */
  contacts?: Array<{
    contactId?: string;
    inline?: {
      type: string;
      displayName: string;
      company?: string | null;
      primaryEmail?: string | null;
      primaryPhone?: string | null;
      additionalChannels?: Array<{ channel: string; value: string; label?: string }>;
      notes?: string | null;
    };
    role: string;
    isPrimary: boolean;
  }>;
  restriction?: {
    isHome: boolean;
    unavailableDays?: string[];
    unavailableHours?: string[];
    notes?: string;
    source: RestrictionSource;
  };
  /** App credentials to link (live reference, many-to-many). Each must belong to the appointment's tenant. */
  appCredentialIds?: string[];
  keyRequired: boolean;
  meetingLocation?: string;
  keyLocation?: string;
  notes?: string;
  observation?: string;
  customFields?: AppointmentCustomField[];
  idempotencyKey?: string;
  actorTimezone?: string;
  /**
   * Bypasses ONLY the time-of-day re-check (`TIME_IN_PAST`) below — the
   * date-level check (`DATE_IN_PAST`) always still runs regardless of this
   * flag. Exists solely for the appointment-import commit worker: a row
   * whose date was empty and defaulted to "today" must not fail just because
   * the batch is committed later in the day than its defaulted 08:00 start.
   * Not present on `createAppointmentSchema`, so unreachable from the public
   * HTTP API — set exclusively by the commit worker.
   */
  skipTimeInPastCheck?: boolean;
  actor: AuthContext;
}

export interface CreateAppointmentOutput {
  id: string;
  tenantId: string;
  branchId: string;
  propertyId: string;
  serviceTypeId: string;
  inspectorId: string | null;
  status: string;
  scheduledDate: Date;
  timeSlotStart: string;
  timeSlotEnd: string;
  keyRequired: boolean;
  meetingLocation: string | null;
  keyLocation: string | null;
  rentalTenantConfirmationStatus: string;
  priceAmount: number;
  payoutAmount: number;
  pricingRuleSnapshotJson: Record<string, unknown>;
  notes: string | null;
  observation: string | null;
  customFieldsJson: AppointmentCustomField[] | null;
  reason: string | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  contact: {
    id: string;
    rentalTenantName: string;
    primaryEmail: string | null;
    primaryPhone: string | null;
  };
  restriction: {
    id: string;
    isHome: boolean;
    unavailableDaysJson: string[] | null;
    unavailableHoursJson: string[] | null;
    notes: string | null;
    source: string;
  } | null;
  apps: AppointmentApp[];
}

export class CreateAppointmentUseCase {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly branchRepo: IBranchRepository,
    private readonly propertyRepo: IPropertyRepository,
    private readonly serviceTypeRepo: IServiceTypeRepository,
    private readonly pricingRuleRepo: IPricingRuleRepository,
    private readonly createPropertyUseCase: CreatePropertyUseCase,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly tenantRepo?: ITenantRepository,
    private readonly contactRepo?: IContactRepository,
    // Clock defaults to the system clock for production. Tests that need
    // deterministic past/today/future behaviour pass a FakeClock.
    private readonly clock: Clock = new SystemClock(),
    private readonly idempotencyService?: IIdempotencyService,
    private readonly appCredentialRepo?: IAppCredentialRepository,
  ) {}

  async execute(input: CreateAppointmentInput): Promise<CreateAppointmentOutput> {
    const { actor, idempotencyKey } = input;

    // 0. Idempotency check (opt-in via header)
    if (idempotencyKey && this.idempotencyService) {
      const cached = await this.idempotencyService.get<CreateAppointmentOutput>(idempotencyKey, 'appointment.create');
      if (cached) return cached;
    }

    // 1. RBAC: AM/OP/CL_ADMIN/CL_USER allowed; INSP/TNT forbidden
    this.authorizationService.assertRoles(actor, ['AM', 'OP', 'CL_ADMIN', 'CL_USER'], { action: 'appointment.create', entityType: 'Appointment' });

    // 1b. CL_USER must have create_appointments permission
    this.authorizationService.assertClUserPermission(actor, 'create_appointments');

    // 1c. TZ-aware past-date/time validation — fail fast before expensive repo lookups.
    // Falls back to UTC when actorTimezone absent (R7: PWA / future callers).
    // DATE_IN_PAST always throws, regardless of skipTimeInPastCheck — only
    // the time-of-day outcome is ever bypassed (see the flag's doc comment).
    {
      const tz = input.actorTimezone ?? 'UTC';
      const scheduleCheck = validateNewSchedule({ date: input.scheduledDate, timeSlot: input.timeSlotStart, tz });
      if (!scheduleCheck.ok) {
        if (scheduleCheck.code === 'TIME_IN_PAST') {
          if (!input.skipTimeInPastCheck) throw new AppointmentTimeInPastError();
        } else {
          throw new AppointmentDateInPastError();
        }
      }
    }

    // 2. Resolve tenantId and validate branch. AM/OP are cross-tenant.
    let tenantId: string;
    if (actor.role === 'AM' || actor.role === 'OP') {
      // AM/OP have no own tenant scope: infer tenantId from the branch.
      const branch = await this.branchRepo.findById(input.branchId, '');
      if (!branch) {
        throw new AppointmentBranchNotFoundError();
      }
      if (!branch.isActive()) {
        throw new AppointmentBranchInactiveError();
      }
      tenantId = branch.tenantId;
    } else {
      // CL_ADMIN / CL_USER: use tenantId from JWT, validate branch in scope
      tenantId = actor.tenantId!;
      const branch = await this.branchRepo.findById(input.branchId, tenantId);
      if (!branch) {
        throw new AppointmentBranchNotFoundError();
      }
      if (!branch.isActive()) {
        throw new AppointmentBranchInactiveError();
      }
    }

    // 4. Resolve property
    let propertyId: string;
    if (input.propertyId) {
      const property = await this.propertyRepo.findById(input.propertyId, tenantId);
      if (!property || property.isDeleted()) {
        throw new AppointmentPropertyNotFoundError();
      }
      if (property.tenantId !== tenantId) {
        throw new AppointmentPropertyTenantMismatchError();
      }
      propertyId = property.id;
    } else if (input.property) {
      // Create property inline
      const createdProperty = await this.createPropertyUseCase.execute({
        tenantId,
        branchId: input.branchId,
        type: input.property.type,
        apartmentNumber: input.property.apartmentNumber,
        street: input.property.street,
        addressLine2: input.property.addressLine2,
        suburb: input.property.suburb,
        postcode: input.property.postcode,
        state: input.property.state,
        country: input.property.country,
        notes: input.property.notes,
        actor,
      });
      propertyId = createdProperty.id;
    } else {
      throw new ValidationError('Either propertyId or property must be provided');
    }

    // 5. Validate serviceType exists and is ACTIVE
    const serviceType = await this.serviceTypeRepo.findById(input.serviceTypeId);
    if (!serviceType) {
      throw new AppointmentServiceTypeNotFoundError();
    }
    if (!serviceType.isActive()) {
      throw new AppointmentServiceTypeInactiveError();
    }

    // 6. Resolve pricing rule
    const pricingRules = await this.pricingRuleRepo.findAll(
      { tenantId, serviceTypeId: input.serviceTypeId, status: 'ACTIVE' },
      { page: 1, pageSize: 100, sortOrder: 'asc' },
    );
    const pricingRule = resolvePricingRule(pricingRules, input.branchId);
    if (!pricingRule) {
      throw new AppointmentNoPriceRuleError();
    }

    // 7. Snapshot pricing and calculate payout
    const snapshot = snapshotPricing(pricingRule);
    const payoutAmount = calculatePayoutAmount(
      pricingRule.priceAmount,
      pricingRule.payoutType,
      pricingRule.payoutValue,
    );

    // 8. Create entities
    const now = this.clock.now();
    const appointmentId = crypto.randomUUID();

    const appointment = new AppointmentEntity({
      id: appointmentId,
      tenantId,
      branchId: input.branchId,
      propertyId,
      serviceTypeId: input.serviceTypeId,
      inspectorId: null,
      status: 'DRAFT',
      scheduledDate: new Date(input.scheduledDate),
      timeSlotStart: input.timeSlotStart,
      timeSlotEnd: input.timeSlotEnd,
      keyRequired: input.keyRequired,
      meetingLocation: input.meetingLocation ?? null,
      keyLocation: input.keyLocation ?? null,
      rentalTenantConfirmationStatus: 'PENDING',
      priceAmount: pricingRule.priceAmount,
      payoutAmount,
      pricingRuleSnapshotJson: snapshot as unknown as Record<string, unknown>,
      notes: input.notes ?? null,
      observation: input.observation ?? null,
      customFieldsJson: input.customFields ?? null,
      reason: null,
      cancellationReasonCode: null,
      rejectionReasonCode: null,
      createdByUserId: actor.userId,
      doneMarkedByUserId: null,
      doneCheckedByUserId: null,
      doneCheckedAt: null,
      serviceGroupId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });

    // 9. Save appointment
    await this.appointmentRepo.save(appointment);

    // 10. Create contacts (junction + snapshot)
    const contactEntries = input.contacts ?? [];
    let contact: AppointmentContactEntity | null = null;

    if (contactEntries.length > 0 && this.contactRepo) {
      // New path: contacts array via feature 021
      for (const entry of contactEntries) {
        let contactId: string | null = null;
        let snapshotName: string;
        let snapshotEmail: string | null;
        let snapshotPhone: string | null;

        if (entry.contactId) {
          // Link to existing registry contact.
          //
          // 024 §FR-301/303 (BUG-024-001 → BUG-024-002 fix) — Contact is a
          // cross-tenant entity. The registry lookup MUST always be global
          // (no `tenant_id` WHERE filter), otherwise CL_ADMIN(B) trying to
          // link a contact whose registry row lives in tenant A — even if
          // operationally visible to B via `appointment_contacts` — gets a
          // null findById and the visibility gate is unreachable. Cycle 2
          // attempted `lookupTenantId = isCrossTenantActor ? null : tenantId`
          // and the unit test passed because mocks ignore arguments;
          // production Prisma's `WHERE tenant_id = $2` filtered out the row.
          //
          // Visibility for CL roles is enforced separately:
          //   1. fast path: `registryContact.tenantId === tenantId` (legacy
          //      pin — the contact is registry-owned by the actor's tenant);
          //   2. fallback: operational-junction predicate
          //      (`existsLinkedToTenant`) — a contact with `tenant_id = null`
          //      or a different tenant is reachable iff already linked to an
          //      appointment in the actor's tenant.
          //
          // Both "not in registry" and "not visible to CL" surface as the
          // same NotFoundError → 404 (FR-022 leakage avoidance, OBS-024-003).
          const isCrossTenantActor = actor.role === 'AM' || actor.role === 'OP';
          const registryContact = await this.contactRepo.findById(entry.contactId, null);
          if (!registryContact) {
            throw new NotFoundError('APPOINTMENT_CONTACT_NOT_FOUND', `Contact ${entry.contactId} not found`);
          }
          if (!isCrossTenantActor) {
            const ownsContact = registryContact.tenantId === tenantId;
            const visible = ownsContact
              || await this.contactRepo.existsLinkedToTenant(entry.contactId, tenantId);
            if (!visible) {
              throw new NotFoundError('APPOINTMENT_CONTACT_NOT_FOUND', `Contact ${entry.contactId} not found`);
            }
          }
          if (!registryContact.isActive) {
            throw new ValidationError('APPOINTMENT_CONTACT_INACTIVE', `Contact ${entry.contactId} is not active`);
          }
          contactId = registryContact.id;
          snapshotName = registryContact.displayName;
          snapshotEmail = registryContact.primaryEmail;
          snapshotPhone = registryContact.primaryPhone;
        } else if (entry.inline) {
          // Reuse an existing active registry contact whose email/phone
          // matches the inline payload before creating a new row. Keeps the
          // inline path idempotent and prevents the
          // contacts_tenant_email_active_unique /
          // contacts_tenant_phone_active_unique partial indexes from
          // surfacing as a 500 on repeat submissions.
          const inlineEmail = entry.inline.primaryEmail ?? null;
          const inlinePhone = entry.inline.primaryPhone ?? null;
          const existing = await this.contactRepo.findActiveByEmailOrPhone(
            tenantId,
            inlineEmail,
            inlinePhone,
          );
          if (existing) {
            contactId = existing.id;
            snapshotName = existing.displayName;
            snapshotEmail = existing.primaryEmail;
            snapshotPhone = existing.primaryPhone;
          } else {
            if (!inlineEmail && !inlinePhone && (entry.inline.additionalChannels ?? []).length === 0) {
              throw new ContactNoChannelError();
            }
            const newContact = new ContactEntity({
              id: crypto.randomUUID(),
              tenantId,
              type: entry.inline.type as any,
              displayName: entry.inline.displayName,
              company: entry.inline.company ?? null,
              primaryEmail: inlineEmail,
              primaryPhone: inlinePhone,
              additionalChannels: (entry.inline.additionalChannels ?? []) as any,
              notes: entry.inline.notes ?? null,
              isActive: true,
              createdAt: now,
              updatedAt: now,
            });
            await this.contactRepo.save(newContact);
            contactId = newContact.id;
            snapshotName = newContact.displayName;
            snapshotEmail = newContact.primaryEmail;
            snapshotPhone = newContact.primaryPhone;
          }
        } else {
          throw new ValidationError('APPOINTMENT_CONTACT_INVALID', 'Each contact must have either contactId or inline');
        }

        const junctionRow = new AppointmentContactEntity({
          id: crypto.randomUUID(),
          appointmentId,
          contactId,
          role: entry.role as AppointmentContactRole,
          isPrimary: entry.isPrimary,
          snapshotName,
          snapshotEmail,
          snapshotPhone,
          createdAt: now,
          updatedAt: now,
        });
        await this.appointmentRepo.saveContact(junctionRow);

        // Keep reference to first contact for backward-compat return value
        if (!contact) {
          contact = junctionRow;
        }
      }
    } else if (input.contact) {
      // Legacy path: single contact object (backward compat)
      const contactRowId = crypto.randomUUID();
      contact = new AppointmentContactEntity({
        id: contactRowId,
        appointmentId,
        contactId: null,
        role: 'RENTAL_TENANT' as AppointmentContactRole,
        isPrimary: true,
        snapshotName: input.contact.rentalTenantName,
        snapshotEmail: input.contact.primaryEmail ?? null,
        snapshotPhone: input.contact.primaryPhone ?? null,
        createdAt: now,
        updatedAt: now,
      });
      await this.appointmentRepo.saveContact(contact);
    }

    // 10b. Link app credentials (live reference). Each must belong to this
    // appointment's tenant and be active. Missing-or-other-tenant collapse to
    // the same 404 to avoid leaking another agency's credential existence.
    const linkedApps = await this.linkAppCredentials(appointmentId, tenantId, input.branchId, input.appCredentialIds);

    // 11. Create restriction if provided
    let restriction: AppointmentRestrictionEntity | null = null;
    if (input.restriction) {
      const restrictionId = crypto.randomUUID();
      restriction = new AppointmentRestrictionEntity({
        id: restrictionId,
        appointmentId,
        isHome: input.restriction.isHome,
        unavailableDaysJson: input.restriction.unavailableDays ?? null,
        unavailableHoursJson: input.restriction.unavailableHours ?? null,
        notes: input.restriction.notes ?? null,
        source: input.restriction.source,
        createdAt: now,
        updatedAt: now,
      });
      await this.appointmentRepo.saveRestriction(restriction);
    }

    // 12. Audit log
    this.auditService.log({
      action: 'appointment.created',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'Appointment',
      entityId: appointmentId,
      tenantId,
      after: {
        id: appointmentId,
        status: 'DRAFT',
        branchId: input.branchId,
        propertyId,
        serviceTypeId: input.serviceTypeId,
        scheduledDate: input.scheduledDate,
        timeSlotStart: input.timeSlotStart,
        timeSlotEnd: input.timeSlotEnd,
      },
    });

    // 13. Return output
    const result: CreateAppointmentOutput = {
      id: appointment.id,
      tenantId: appointment.tenantId,
      branchId: appointment.branchId,
      propertyId: appointment.propertyId,
      serviceTypeId: appointment.serviceTypeId,
      inspectorId: appointment.inspectorId,
      status: appointment.status,
      scheduledDate: appointment.scheduledDate,
      timeSlotStart: appointment.timeSlotStart,
      timeSlotEnd: appointment.timeSlotEnd,
      keyRequired: appointment.keyRequired,
      meetingLocation: appointment.meetingLocation,
      keyLocation: appointment.keyLocation,
      rentalTenantConfirmationStatus: appointment.rentalTenantConfirmationStatus,
      priceAmount: appointment.priceAmount,
      payoutAmount: appointment.payoutAmount,
      pricingRuleSnapshotJson: appointment.pricingRuleSnapshotJson,
      notes: appointment.notes,
      observation: appointment.observation,
      customFieldsJson: appointment.customFieldsJson,
      reason: appointment.reason,
      createdByUserId: appointment.createdByUserId,
      createdAt: appointment.createdAt,
      updatedAt: appointment.updatedAt,
      contact: contact
        ? {
            id: contact.id,
            rentalTenantName: contact.effectiveName,
            primaryEmail: contact.effectiveEmail,
            primaryPhone: contact.effectivePhone,
          }
        : {
            id: '',
            rentalTenantName: '',
            primaryEmail: null,
            primaryPhone: null,
          },
      restriction: restriction
        ? {
            id: restriction.id,
            isHome: restriction.isHome,
            unavailableDaysJson: restriction.unavailableDaysJson,
            unavailableHoursJson: restriction.unavailableHoursJson,
            notes: restriction.notes,
            source: restriction.source,
          }
        : null,
      apps: linkedApps,
    };

    // Store idempotency result for future duplicate requests
    if (idempotencyKey && this.idempotencyService) {
      await this.idempotencyService.set(idempotencyKey, 'appointment.create', result, 24);
    }

    return result;
  }

  /**
   * Validate and persist appointment ↔ app-credential links (live reference).
   * Returns the linked credentials as a flat payload for the response. A
   * `undefined` id list means "no app linkage requested" → returns [].
   */
  private async linkAppCredentials(
    appointmentId: string,
    tenantId: string,
    branchId: string,
    appCredentialIds: string[] | undefined,
  ): Promise<AppointmentApp[]> {
    if (appCredentialIds === undefined || !this.appCredentialRepo) return [];
    const ids = [...new Set(appCredentialIds)];
    if (ids.length === 0) return [];

    const found = await this.appCredentialRepo.findByIds(ids);
    const byId = new Map(found.map((a) => [a.id, a]));
    for (const id of ids) {
      const cred = byId.get(id);
      if (!cred || cred.tenantId !== tenantId) {
        throw new NotFoundError('APPOINTMENT_APP_CREDENTIAL_NOT_FOUND', `App credential ${id} not found`);
      }
      if (!cred.isActive) {
        throw new ValidationError('APPOINTMENT_APP_CREDENTIAL_INACTIVE', `App credential ${id} is not active`);
      }
      // Branch-scoped credentials only attach to appointments of that branch;
      // agency-wide credentials (branchId null) attach anywhere in the tenant.
      if (cred.branchId !== null && cred.branchId !== branchId) {
        throw new ValidationError(
          'APPOINTMENT_APP_CREDENTIAL_BRANCH_MISMATCH',
          `App credential ${id} belongs to another branch`,
        );
      }
    }

    await this.appCredentialRepo.replaceAppointmentLinks(appointmentId, ids);
    return ids.map((id) => {
      const cred = byId.get(id)!;
      return toAppointmentApp(cred);
    });
  }
}
