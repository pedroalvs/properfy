import type { ITenantPortalActivityRepository } from '../../domain/tenant-portal-activity.repository';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { IServiceTypeRepository } from '../../../service-type/domain/service-type.repository';
import type { PersistentAuditService } from '../../../audit/application/services/persistent-audit.service';
import { TenantPortalActivityEntity } from '../../domain/tenant-portal-activity.entity';
import { AppointmentRestrictionEntity } from '../../../appointment/domain/appointment-restriction.entity';
import {
  PortalActionBlockedError,
  PortalAppointmentInactiveError,
  PortalRescheduleNotAllowedError,
  PortalRescheduleWindowExceededError,
  PortalDateInPastError,
} from '../../domain/tenant-portal.errors';
import { NotFoundError } from '../../../../shared/domain/errors';

export interface RescheduleRequestInput {
  tokenId: string;
  appointmentId: string;
  isReadOnly: boolean;
  newDate: string;
  newTimeSlot: string;
  restrictions?: {
    isHome: boolean;
    unavailableDaysJson: string[] | null;
    unavailableHoursJson: string[] | null;
    notes: string | null;
  };
  ipAddress: string | null;
  userAgent: string | null;
}

const INACTIVE_STATUSES = ['CANCELLED', 'DONE', 'REJECTED'] as const;
const MAX_RESCHEDULE_DAYS = 30;

export class RescheduleRequestUseCase {
  constructor(
    private readonly activityRepo: ITenantPortalActivityRepository,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly serviceTypeRepo: IServiceTypeRepository,
    private readonly auditService: PersistentAuditService,
    private readonly onNotificationHandler?: { execute(input: { appointmentId: string; action: string }): Promise<unknown> },
  ) {}

  async execute(input: RescheduleRequestInput) {
    // 1. Block if token is read-only (expired)
    if (input.isReadOnly) {
      throw new PortalActionBlockedError();
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

    // 4. Load service type and check flow_type
    const serviceType = await this.serviceTypeRepo.findById(appointment.serviceTypeId);
    if (!serviceType || serviceType.flowType !== 'ROUTINE') {
      throw new PortalRescheduleNotAllowedError();
    }

    // 5. Validate newDate is not in the past
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const newDateObj = new Date(input.newDate + 'T00:00:00Z');
    if (newDateObj.getTime() < today.getTime()) {
      throw new PortalDateInPastError();
    }

    // 6. Validate newDate is within 30 days of original scheduledDate
    const originalDate = new Date(appointment.scheduledDate);
    const diffMs = Math.abs(newDateObj.getTime() - originalDate.getTime());
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    if (diffDays > MAX_RESCHEDULE_DAYS) {
      throw new PortalRescheduleWindowExceededError();
    }

    // 7. Snapshot previous values
    const previousValues = {
      scheduledDate: appointment.scheduledDate.toISOString(),
      timeSlot: appointment.timeSlot,
      tenantConfirmationStatus: appointment.tenantConfirmationStatus,
    };

    // 8. Update appointment
    await this.appointmentRepo.update(input.appointmentId, appointment.tenantId, {
      scheduledDate: new Date(input.newDate),
      timeSlot: input.newTimeSlot,
      tenantConfirmationStatus: 'PENDING',
    });

    // 9. Save restrictions if provided
    if (input.restrictions) {
      await this.appointmentRepo.deleteRestrictionsByAppointmentId(input.appointmentId);

      const restriction = new AppointmentRestrictionEntity({
        id: crypto.randomUUID(),
        appointmentId: input.appointmentId,
        isHome: input.restrictions.isHome,
        unavailableDaysJson: input.restrictions.unavailableDaysJson,
        unavailableHoursJson: input.restrictions.unavailableHoursJson,
        notes: input.restrictions.notes,
        source: 'TENANT_PORTAL',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      await this.appointmentRepo.saveRestriction(restriction);
    }

    // 10. Record RESCHEDULE activity
    const newValues = {
      scheduledDate: input.newDate,
      timeSlot: input.newTimeSlot,
      tenantConfirmationStatus: 'PENDING',
    };

    const activity = new TenantPortalActivityEntity({
      id: crypto.randomUUID(),
      appointmentId: input.appointmentId,
      tenantPortalTokenId: input.tokenId,
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
      action: 'tenant_portal.appointment_rescheduled',
      actorType: 'ANONYMOUS',
      entityType: 'appointment',
      entityId: input.appointmentId,
      tenantId: appointment.tenantId,
      before: previousValues,
      after: newValues,
      ipAddress: input.ipAddress ?? undefined,
    });

    // 12. Side effect: notification on reschedule
    if (this.onNotificationHandler) {
      try {
        await this.onNotificationHandler.execute({ appointmentId: input.appointmentId, action: 'RESCHEDULE' });
      } catch {
        // fire-and-forget — notification failure must not affect the reschedule
      }
    }

    return {
      scheduledDate: input.newDate,
      timeSlot: input.newTimeSlot,
      tenantConfirmationStatus: 'PENDING' as const,
    };
  }
}
