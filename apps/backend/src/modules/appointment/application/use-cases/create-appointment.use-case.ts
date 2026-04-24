import { type AuthContext, type PropertyType } from '@properfy/shared';
import type { AppointmentContactRole } from '@properfy/shared';
import {
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
  AppointmentPastDateError,
} from '../../domain/appointment.errors';
import type { RestrictionSource } from '@properfy/shared';
import type { IAppointmentTimeSlotRepository } from '../../../appointment-time-slot/domain/appointment-time-slot.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { SystemClock, type Clock } from '../../../../shared/domain/clock';

export interface CreateAppointmentInput {
  branchId: string;
  propertyId?: string;
  property?: {
    propertyCode: string;
    type: PropertyType;
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
  timeSlot: string; // HH:mm-HH:mm
  /** @deprecated Use contacts array instead */
  contact?: {
    tenantName: string;
    primaryEmail?: string;
    secondaryEmail?: string;
    primaryPhone?: string;
    secondaryPhone?: string;
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
  keyRequired: boolean;
  meetingLocation?: string;
  keyLocation?: string;
  notes?: string;
  customFields?: Record<string, unknown>;
  idempotencyKey?: string;
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
  timeSlot: string;
  keyRequired: boolean;
  meetingLocation: string | null;
  keyLocation: string | null;
  tenantConfirmationStatus: string;
  priceAmount: number;
  payoutAmount: number;
  pricingRuleSnapshotJson: Record<string, unknown>;
  notes: string | null;
  customFieldsJson: Record<string, unknown> | null;
  reason: string | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  contact: {
    id: string;
    tenantName: string;
    primaryEmail: string | null;
    secondaryEmail: string | null;
    primaryPhone: string | null;
    secondaryPhone: string | null;
  };
  restriction: {
    id: string;
    isHome: boolean;
    unavailableDaysJson: string[] | null;
    unavailableHoursJson: string[] | null;
    notes: string | null;
    source: string;
  } | null;
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
    private readonly timeSlotRepo?: IAppointmentTimeSlotRepository,
    private readonly contactRepo?: IContactRepository,
    // Clock defaults to the system clock for production. Tests that need
    // deterministic past/today/future behaviour pass a FakeClock.
    private readonly clock: Clock = new SystemClock(),
    private readonly idempotencyService?: IIdempotencyService,
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

    // 2. Resolve tenantId and validate branch. Only AM is cross-tenant.
    // OP is tenant-scoped per Sprint 1 W-4-IMPL (CORRECTION-001 close-it).
    let tenantId: string;
    if (actor.role === 'AM') {
      // AM: lookup branch without tenant scope to infer tenantId
      const branch = await this.branchRepo.findById(input.branchId, '');
      if (!branch) {
        throw new AppointmentBranchNotFoundError();
      }
      if (!branch.isActive()) {
        throw new AppointmentBranchInactiveError();
      }
      tenantId = branch.tenantId;
    } else {
      // OP / CL_ADMIN / CL_USER: use tenantId from JWT, validate branch in scope
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
        propertyCode: input.property.propertyCode,
        type: input.property.type,
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

    // 5b. Validate timeSlot exists in effective catalog
    if (this.timeSlotRepo) {
      const effectiveSlots = await this.timeSlotRepo.findEffective(tenantId, input.branchId);
      const valid = effectiveSlots.some(
        (s) => s.compositeValue === input.timeSlot,
      );
      if (!valid) {
        throw new ValidationError(
          `Time slot "${input.timeSlot}" is not available for this branch`,
        );
      }
    }

    // 5c. Reject past dates (AM/OP bypass) — UTC comparison for server consistency.
    // Uses the injected Clock so tests can freeze the reference date.
    const todayStr = this.clock.now().toISOString().split('T')[0]!;
    if (input.scheduledDate < todayStr && actor.role !== 'AM' && actor.role !== 'OP') {
      throw new AppointmentPastDateError();
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
      timeSlot: input.timeSlot,
      keyRequired: input.keyRequired,
      meetingLocation: input.meetingLocation ?? null,
      keyLocation: input.keyLocation ?? null,
      tenantConfirmationStatus: 'PENDING',
      priceAmount: pricingRule.priceAmount,
      payoutAmount,
      pricingRuleSnapshotJson: snapshot as unknown as Record<string, unknown>,
      notes: input.notes ?? null,
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
          // Link to existing registry contact
          const registryContact = await this.contactRepo.findById(entry.contactId, tenantId);
          if (!registryContact) {
            throw new ValidationError('APPOINTMENT_CONTACT_NOT_FOUND', `Contact ${entry.contactId} not found in tenant`);
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
          tenantName: snapshotName,
          primaryEmail: snapshotEmail,
          secondaryEmail: null,
          primaryPhone: snapshotPhone,
          secondaryPhone: null,
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
        role: 'TENANT' as AppointmentContactRole,
        isPrimary: true,
        snapshotName: input.contact.tenantName,
        snapshotEmail: input.contact.primaryEmail ?? null,
        snapshotPhone: input.contact.primaryPhone ?? null,
        tenantName: input.contact.tenantName,
        primaryEmail: input.contact.primaryEmail ?? null,
        secondaryEmail: input.contact.secondaryEmail ?? null,
        primaryPhone: input.contact.primaryPhone ?? null,
        secondaryPhone: input.contact.secondaryPhone ?? null,
        createdAt: now,
        updatedAt: now,
      });
      await this.appointmentRepo.saveContact(contact);
    }

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
        timeSlot: input.timeSlot,
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
      timeSlot: appointment.timeSlot,
      keyRequired: appointment.keyRequired,
      meetingLocation: appointment.meetingLocation,
      keyLocation: appointment.keyLocation,
      tenantConfirmationStatus: appointment.tenantConfirmationStatus,
      priceAmount: appointment.priceAmount,
      payoutAmount: appointment.payoutAmount,
      pricingRuleSnapshotJson: appointment.pricingRuleSnapshotJson,
      notes: appointment.notes,
      customFieldsJson: appointment.customFieldsJson,
      reason: appointment.reason,
      createdByUserId: appointment.createdByUserId,
      createdAt: appointment.createdAt,
      updatedAt: appointment.updatedAt,
      contact: contact
        ? {
            id: contact.id,
            tenantName: contact.tenantName,
            primaryEmail: contact.primaryEmail,
            secondaryEmail: contact.secondaryEmail,
            primaryPhone: contact.primaryPhone,
            secondaryPhone: contact.secondaryPhone,
          }
        : {
            id: '',
            tenantName: '',
            primaryEmail: null,
            secondaryEmail: null,
            primaryPhone: null,
            secondaryPhone: null,
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
    };

    // Store idempotency result for future duplicate requests
    if (idempotencyKey && this.idempotencyService) {
      await this.idempotencyService.set(idempotencyKey, 'appointment.create', result, 24);
    }

    return result;
  }
}
