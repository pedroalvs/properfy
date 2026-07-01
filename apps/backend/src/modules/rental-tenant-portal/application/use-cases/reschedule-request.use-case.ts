import type { AvailableSlot } from '@properfy/shared';
import type { IRentalTenantPortalActivityRepository } from '../../domain/rental-tenant-portal-activity.repository';
import type { IRentalTenantPortalTokenRepository } from '../../domain/rental-tenant-portal-token.repository';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { IServiceTypeRepository } from '../../../service-type/domain/service-type.repository';
import type { IInspectionExecutionRepository } from '../../../inspector-execution/domain/inspection-execution.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { DomainEventBus } from '../../../../shared/application/events/domain-event-bus';
import { TENANT_PORTAL_EVENTS } from '../../../../shared/application/events/domain-event-bus';
import type { ReopenForRescheduleUseCase } from '../../../appointment/application/use-cases/reopen-for-reschedule.use-case';
import type { GeneratePortalTokenUseCase } from './generate-portal-token.use-case';
import { RentalTenantPortalActivityEntity } from '../../domain/rental-tenant-portal-activity.entity';
import { AppointmentRestrictionEntity } from '../../../appointment/domain/appointment-restriction.entity';
import {
  PortalActionBlockedError,
  PortalAppointmentInactiveError,
  PortalRescheduleNotAllowedError,
  PortalRescheduleWindowExceededError,
  PortalDateInPastError,
  PortalInspectionInProgressError,
  PortalTokenAlreadyUsedError,
} from '../../domain/rental-tenant-portal.errors';
import { NotFoundError } from '../../../../shared/domain/errors';
import { SystemClock, type Clock } from '../../../../shared/domain/clock';

export interface RescheduleRequestInput {
  tokenId: string;
  appointmentId: string;
  isReadOnly: boolean;
  isUsed: boolean;
  newDate: string;
  newTimeSlotStart: string;
  newTimeSlotEnd: string;
  restrictions?: {
    isHome: boolean;
    unavailableDaysJson: string[] | null;
    unavailableHoursJson: string[] | null;
    availableSlotsJson?: AvailableSlot[] | null;
    notes: string | null;
  };
  rentalTenantNote?: string;
  ipAddress: string | null;
  userAgent: string | null;
}

const INACTIVE_STATUSES = ['CANCELLED', 'DONE', 'REJECTED'] as const;
const DEFAULT_RESCHEDULE_WINDOW_DAYS = 30;

export class RescheduleRequestUseCase {
  constructor(
    private readonly activityRepo: IRentalTenantPortalActivityRepository,
    private readonly tokenRepo: IRentalTenantPortalTokenRepository,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly serviceTypeRepo: IServiceTypeRepository,
    private readonly executionRepo: IInspectionExecutionRepository,
    private readonly tenantRepo: ITenantRepository,
    private readonly auditService: AuditService,
    private readonly reopenForRescheduleUseCase: ReopenForRescheduleUseCase,
    private readonly onNotificationHandler?: { execute(input: { appointmentId: string; tenantId?: string | null; action: string }): Promise<unknown> },
    private readonly domainEventBus?: DomainEventBus,
    private readonly generatePortalTokenUseCase?: GeneratePortalTokenUseCase,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute(input: RescheduleRequestInput) {
    // 1. Block if token is read-only (expired)
    if (input.isReadOnly) {
      throw new PortalActionBlockedError();
    }

    // 1b. Block if token has already been used for a mutation
    if (input.isUsed) {
      throw new PortalTokenAlreadyUsedError();
    }

    // 2. Load appointment
    const result = await this.appointmentRepo.findById(input.appointmentId, null);
    if (!result) {
      throw new NotFoundError('APPOINTMENT_NOT_FOUND', 'Appointment not found');
    }

    const { appointment } = result;

    // 3. Block for inactive appointment statuses
    if (INACTIVE_STATUSES.includes(appointment.status as (typeof INACTIVE_STATUSES)[number])) {
      throw new PortalAppointmentInactiveError();
    }

    // 4. Block reschedule while inspection is actively in progress
    const activeExecution = await this.executionRepo.findByAppointmentId(input.appointmentId);
    if (activeExecution && !activeExecution.isFinished()) {
      throw new PortalInspectionInProgressError();
    }

    // 5. Load service type and check flow_type
    const serviceType = await this.serviceTypeRepo.findById(appointment.serviceTypeId);
    if (!serviceType || serviceType.flowType !== 'ROUTINE') {
      throw new PortalRescheduleNotAllowedError();
    }

    // 6. Validate newDate is not in the past
    const today = this.clock.now();
    today.setHours(0, 0, 0, 0);
    const newDateObj = new Date(input.newDate + 'T00:00:00Z');
    if (newDateObj.getTime() < today.getTime()) {
      throw new PortalDateInPastError();
    }

    // 7. Load tenant settings to get configurable reschedule window
    const tenant = await this.tenantRepo.findById(appointment.tenantId);
    const settings = tenant?.settingsJson ?? {};
    const maxRescheduleDays = typeof settings.portalRescheduleWindowDays === 'number'
      ? settings.portalRescheduleWindowDays
      : DEFAULT_RESCHEDULE_WINDOW_DAYS;

    // 8. Validate newDate is within reschedule window of original scheduledDate
    const originalDate = new Date(appointment.scheduledDate);
    const diffMs = Math.abs(newDateObj.getTime() - originalDate.getTime());
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays > maxRescheduleDays) {
      throw new PortalRescheduleWindowExceededError();
    }

    // 7. Snapshot previous values
    const previousValues = {
      scheduledDate: appointment.scheduledDate.toISOString(),
      timeSlot: `${appointment.timeSlotStart}-${appointment.timeSlotEnd}`,
      rentalTenantConfirmationStatus: appointment.rentalTenantConfirmationStatus,
    };

    // 8. Delegate to ReopenForRescheduleUseCase (handles status transition, inspector clearing, confirmation reset, audit)
    await this.reopenForRescheduleUseCase.execute({
      appointmentId: input.appointmentId,
      newScheduledDate: input.newDate,
      newTimeSlotStart: input.newTimeSlotStart,
      newTimeSlotEnd: input.newTimeSlotEnd,
      reason: 'Tenant portal reschedule request',
      actor: {
        userId: 'SYSTEM',
        tenantId: appointment.tenantId,
        role: 'SYS',
        branchId: null,
        inspectorId: null,
      },
    });

    // Persist tenant note if provided
    if (input.rentalTenantNote !== undefined) {
      await this.appointmentRepo.update(input.appointmentId, appointment.tenantId, {
        rentalTenantNote: input.rentalTenantNote,
      });
    }

    // Mark token as used (replay detection)
    await this.tokenRepo.markUsed(input.tokenId);

    // Portal reschedule restarts the tenant confirmation cycle; revoke active portal tokens
    // so the cutoff window is not inherited from the previous scheduled date.
    await this.tokenRepo.revokeAllForAppointment(input.appointmentId);

    // 9. Save restrictions if provided
    if (input.restrictions) {
      await this.appointmentRepo.deleteRestrictionsByAppointmentId(input.appointmentId);

      const restriction = new AppointmentRestrictionEntity({
        id: crypto.randomUUID(),
        appointmentId: input.appointmentId,
        isHome: input.restrictions.isHome,
        unavailableDaysJson: input.restrictions.unavailableDaysJson,
        unavailableHoursJson: input.restrictions.unavailableHoursJson,
        availableSlotsJson: input.restrictions.availableSlotsJson ?? null,
        notes: input.restrictions.notes,
        source: 'RENTAL_TENANT_PORTAL',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await this.appointmentRepo.saveRestriction(restriction);
    }

    // 10. Record RESCHEDULE activity
    const newValues = {
      scheduledDate: input.newDate,
      timeSlot: `${input.newTimeSlotStart}-${input.newTimeSlotEnd}`,
      rentalTenantConfirmationStatus: 'PENDING',
    };

    const activity = new RentalTenantPortalActivityEntity({
      id: crypto.randomUUID(),
      appointmentId: input.appointmentId,
      rentalTenantPortalTokenId: input.tokenId,
      action: 'RESCHEDULE',
      previousValuesJson: previousValues,
      newValuesJson: newValues,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      createdAt: new Date(),
    });
    await this.activityRepo.save(activity);

    // 11. Audit log
    this.auditService.log({
      action: 'rental_tenant_portal.appointment_rescheduled',
      actorType: 'ANONYMOUS',
      entityType: 'Appointment',
      entityId: input.appointmentId,
      tenantId: appointment.tenantId,
      before: previousValues,
      after: newValues,
      ipAddress: input.ipAddress ?? undefined,
    });

    // 12. Side effect: notification on reschedule
    if (this.onNotificationHandler) {
      try {
        await this.onNotificationHandler.execute({ appointmentId: input.appointmentId, tenantId: appointment.tenantId, action: 'RESCHEDULE' });
      } catch {
        // fire-and-forget — notification failure must not affect the reschedule
      }
    }

    // 13. Emit domain event
    if (this.domainEventBus) {
      await this.domainEventBus.emit({
        type: TENANT_PORTAL_EVENTS.RESCHEDULED,
        payload: {
          appointmentId: input.appointmentId,
          tenantId: appointment.tenantId,
          tokenId: input.tokenId,
          newDate: input.newDate,
          newTimeSlot: `${input.newTimeSlotStart}-${input.newTimeSlotEnd}`,
        },
        occurredAt: new Date(),
      });
    }

    // 14. Auto-generate new portal token for the rescheduled date (GAP-004)
    if (this.generatePortalTokenUseCase) {
      try {
        await this.generatePortalTokenUseCase.execute({
          appointmentId: input.appointmentId,
          actor: {
            userId: 'SYSTEM',
            tenantId: appointment.tenantId,
            role: 'OP',
          },
          // Reopen-for-reschedule already moved the appointment to DRAFT; the
          // re-issued link must still reach the tenant for the new date.
          allowAnyStatus: true,
        });
      } catch {
        // fire-and-forget — token generation failure must not affect the reschedule
      }
    }

    return {
      scheduledDate: input.newDate,
      timeSlotStart: input.newTimeSlotStart,
      timeSlotEnd: input.newTimeSlotEnd,
      rentalTenantConfirmationStatus: 'PENDING' as const,
    };
  }
}
