import { UserRole } from '@properfy/shared';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { IServiceGroupRepository } from '../../../service-group/domain/service-group.repository';
import type { IRentalTenantPortalActivityRepository } from '../../domain/rental-tenant-portal-activity.repository';
import type { IRentalTenantPortalTokenRepository } from '../../domain/rental-tenant-portal-token.repository';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { ExecuteStatusTransitionInput, ExecuteStatusTransitionOutput } from '../../../appointment/application/use-cases/execute-status-transition.use-case';
import { RentalTenantPortalActivityEntity } from '../../domain/rental-tenant-portal-activity.entity';
import type { AppointmentEntity } from '../../../appointment/domain/appointment.entity';
import type { ServiceGroupEntity } from '../../../service-group/domain/service-group.entity';
import {
  PortalAppointmentInactiveError,
  PortalTokenAlreadyUsedError,
  PortalGroupNotFoundError,
  PortalGroupFullError,
  PortalGroupUnavailableError,
  PortalGroupSlotUnavailableError,
} from '../../domain/rental-tenant-portal.errors';

interface IStatusTransitionUseCase {
  execute(input: ExecuteStatusTransitionInput): Promise<ExecuteStatusTransitionOutput>;
}

interface INotificationHandler {
  execute(input: { appointmentId: string; tenantId?: string | null; action: string }): Promise<unknown>;
}

export interface JoinGroupInput {
  tokenId: string;
  appointmentId: string;
  groupId: string;
  scheduledDate: string;
  timeSlotStart: string;
  timeSlotEnd: string;
  isUsed: boolean;
  rentalTenantNote?: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface JoinGroupOutput {
  scheduledDate: string;
  timeSlotStart: string;
  timeSlotEnd: string;
  rentalTenantConfirmationStatus: 'CONFIRMED';
  appointmentStatus: 'SCHEDULED';
  inspector: { id: string; name: string };
}

const ACTIVE_GROUP_STATUSES = new Set(['ACCEPTED']);
const INACTIVE_STATUSES = new Set(['CANCELLED', 'DONE', 'REJECTED']);

export class JoinGroupUseCase {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly serviceGroupRepo: IServiceGroupRepository,
    private readonly activityRepo: IRentalTenantPortalActivityRepository,
    private readonly tokenRepo: IRentalTenantPortalTokenRepository,
    private readonly auditService: AuditService,
    private readonly statusTransition: IStatusTransitionUseCase,
    private readonly onNotificationHandler?: INotificationHandler,
  ) {}

  /**
   * Tenant joins an available service group via the portal.
   * Implements the 13-step side-effect sequence from spec §5.2.
   */
  async execute(input: JoinGroupInput): Promise<JoinGroupOutput> {
    // 1-2. Validate token state. Token expiry does not block a group change:
    // the tenant may still pick another slot after the scheduled day, as long
    // as the appointment is active.
    if (input.isUsed) throw new PortalTokenAlreadyUsedError();

    // Load appointment
    const apptResult = await this.appointmentRepo.findById(input.appointmentId, null);
    if (!apptResult) throw new PortalGroupNotFoundError();
    const { appointment } = apptResult;

    if (INACTIVE_STATUSES.has(appointment.status)) {
      throw new PortalAppointmentInactiveError();
    }

    // 3. Validate group
    const groupResult = await this.serviceGroupRepo.findById(input.groupId, null);
    if (!groupResult) throw new PortalGroupNotFoundError();

    const { group, assignedInspectorName, tenantIds } = groupResult;

    // Tenant isolation: the appointment's agency must be one of the agencies
    // present in the group (groups may now span multiple agencies).
    if (!tenantIds.includes(appointment.tenantId) || group.serviceTypeId !== appointment.serviceTypeId) {
      throw new PortalGroupNotFoundError();
    }
    if (!ACTIVE_GROUP_STATUSES.has(group.status)) {
      throw new PortalGroupUnavailableError();
    }
    if (!group.assignedInspectorId || !assignedInspectorName) {
      throw new PortalGroupUnavailableError();
    }
    if (group.confirmedCount >= 10) {
      throw new PortalGroupFullError();
    }
    if (!appointment.propertyId || !appointment.serviceTypeId) {
      throw new PortalGroupSlotUnavailableError();
    }
    // The appointment's own group is never a valid change-time target.
    if (appointment.serviceGroupId === group.id) {
      throw new PortalGroupSlotUnavailableError();
    }

    const now = new Date();
    const eligibleSlots = await this.serviceGroupRepo.findPortalEligibleSlots({
      tenantId: appointment.tenantId,
      serviceTypeId: appointment.serviceTypeId,
      propertyId: appointment.propertyId,
      today: now,
      excludeGroupId: appointment.serviceGroupId,
    });
    const selectedEligibleSlot = eligibleSlots.find((slot) => (
      slot.groupId === group.id &&
      slot.scheduledDate.toISOString().slice(0, 10) === input.scheduledDate &&
      slot.timeSlotStart === input.timeSlotStart &&
      slot.timeSlotEnd === input.timeSlotEnd
    ));
    if (!selectedEligibleSlot) {
      throw new PortalGroupSlotUnavailableError();
    }

    const hasSelectedSlot = await this.serviceGroupRepo.hasPortalMemberSlot({
      groupId: group.id,
      scheduledDate: input.scheduledDate,
      timeSlotStart: input.timeSlotStart,
      timeSlotEnd: input.timeSlotEnd,
      today: now,
    });
    if (!hasSelectedSlot) {
      throw new PortalGroupSlotUnavailableError();
    }

    // Atomically claim the token before the first side effect. The
    // conditional write is the real replay guard — the isUsed fast-path above
    // is stale under concurrency, so two racing requests must resolve here.
    const claimed = await this.tokenRepo.tryClaim(input.tokenId, input.appointmentId);
    if (!claimed) {
      throw new PortalTokenAlreadyUsedError();
    }

    try {
      await this.applyJoin(input, appointment, group);
    } catch (error) {
      // Best-effort release so the tenant can retry with the same link;
      // never mask the original failure.
      try {
        await this.tokenRepo.releaseClaim(input.tokenId, input.appointmentId);
      } catch {
        // release failure leaves the token consumed — fail-closed
      }
      throw error;
    }

    return {
      scheduledDate: input.scheduledDate,
      timeSlotStart: input.timeSlotStart,
      timeSlotEnd: input.timeSlotEnd,
      rentalTenantConfirmationStatus: 'CONFIRMED',
      appointmentStatus: 'SCHEDULED',
      inspector: { id: group.assignedInspectorId, name: assignedInspectorName },
    };
  }

  /**
   * Side-effect sequence (spec §5.2 steps 4-13), executed only after the
   * token claim succeeded.
   */
  private async applyJoin(input: JoinGroupInput, appointment: AppointmentEntity, group: ServiceGroupEntity): Promise<void> {
    const previousGroupId = appointment.serviceGroupId;
    const previousValues = {
      serviceGroupId: previousGroupId,
      scheduledDate: appointment.scheduledDate,
      timeSlot: `${appointment.timeSlotStart}-${appointment.timeSlotEnd}`,
      status: appointment.status,
    };

    // 4. Detach from previous group
    if (previousGroupId) {
      await this.serviceGroupRepo.decrementConfirmedCount(previousGroupId);
    }

    // 5-8. Update appointment fields
    await this.appointmentRepo.update(input.appointmentId, appointment.tenantId, {
      scheduledDate: new Date(input.scheduledDate),
      timeSlotStart: input.timeSlotStart,
      timeSlotEnd: input.timeSlotEnd,
      inspectorId: group.assignedInspectorId,
      rentalTenantConfirmationStatus: 'CONFIRMED',
      serviceGroupId: group.id,
      ...(input.rentalTenantNote !== undefined ? { rentalTenantNote: input.rentalTenantNote } : {}),
    });

    // 6. Transition to SCHEDULED only when not already in that status
    // (AWAITING_INSPECTOR → SCHEDULED is the normal path; SCHEDULED appointments
    // switching groups must skip this transition to avoid APPOINTMENT_INVALID_TRANSITION)
    if (appointment.status !== 'SCHEDULED') {
      await this.statusTransition.execute({
        appointmentId: input.appointmentId,
        targetStatus: 'SCHEDULED',
        reason: `Tenant joined service group ${group.id} via portal`,
        actor: {
          userId: 'system',
          tenantId: appointment.tenantId,
          role: UserRole.SYS,
          branchId: null,
          inspectorId: null,
        },
      });
    }

    // 7. Increment confirmed_count of new group
    await this.serviceGroupRepo.incrementConfirmedCount(group.id);

    // 10. Record GROUP_JOIN activity
    const activity = new RentalTenantPortalActivityEntity({
      id: crypto.randomUUID(),
      appointmentId: input.appointmentId,
      rentalTenantPortalTokenId: input.tokenId,
      action: 'GROUP_JOIN',
      previousValuesJson: previousValues as Record<string, unknown>,
      newValuesJson: {
        serviceGroupId: group.id,
        scheduledDate: input.scheduledDate,
        timeSlot: `${input.timeSlotStart}-${input.timeSlotEnd}`,
        rentalTenantConfirmationStatus: 'CONFIRMED',
      },
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      createdAt: new Date(),
    });
    await this.activityRepo.save(activity);

    // 11. Audit log
    this.auditService.log({
      action: 'rental_tenant_portal.group_joined',
      actorType: 'ANONYMOUS',
      entityType: 'Appointment',
      entityId: input.appointmentId,
      tenantId: appointment.tenantId,
      before: previousValues as Record<string, unknown>,
      after: {
        serviceGroupId: group.id,
        scheduledDate: input.scheduledDate,
        timeSlotStart: input.timeSlotStart,
        timeSlotEnd: input.timeSlotEnd,
        rentalTenantConfirmationStatus: 'CONFIRMED',
      },
      metadata: {
        groupId: group.id,
        previousGroupId,
        urgentMode: false,
        selectedSlot: {
          scheduledDate: input.scheduledDate,
          timeSlotStart: input.timeSlotStart,
          timeSlotEnd: input.timeSlotEnd,
        },
      },
      ipAddress: input.ipAddress ?? undefined,
    });

    // 13. Fire-and-forget notification
    if (this.onNotificationHandler) {
      try {
        await this.onNotificationHandler.execute({
          appointmentId: input.appointmentId,
          tenantId: appointment.tenantId,
          action: 'GROUP_JOIN',
        });
      } catch {
        // notification failure must not affect the join
      }
    }
  }
}
