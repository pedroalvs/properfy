import type { AuthContext } from '@properfy/shared';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import {
  ServiceGroupNotFoundError,
  ServiceGroupNotDraftError,
  ServiceGroupInvalidStatusError,
  ServiceGroupDateInPastError,
  ServiceGroupTimeInPastError,
} from '../../domain/service-group.errors';
import { validateEditedSchedule, PLATFORM_TIMEZONE, isTerminalAppointmentStatus } from '@properfy/shared';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import {
  trySyncAppointmentScheduleToGroup,
  type ServiceGroupTimeSyncLogger,
} from '../sync-appointment-time-slot-to-group';

/** Fields that can only be updated when the group is in DRAFT status. */
const DRAFT_ONLY_FIELDS = [
  'scheduledDate',
  'timeWindow',
] as const;

export interface UpdateServiceGroupInput {
  groupId: string;
  regionName?: string;
  description?: string;
  serviceRegionId?: string | null;
  scheduledDate?: string;
  timeWindow?: string;
  actor: AuthContext;
}

export interface UpdateServiceGroupOutput {
  id: string;
  tenantId: string | null;
  serviceTypeId: string;
  status: string;
  groupSize: number;
  offeredCount: number;
  confirmedCount: number;
  scheduledDate: Date;
  timeWindow: string;
  regionName: string | null;
  description: string | null;
  assignedInspectorId: string | null;
  serviceRegionId: string | null;
  publishedAt: Date | null;
  assignedAt: Date | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export class UpdateServiceGroupUseCase {
  constructor(
    private readonly serviceGroupRepo: IServiceGroupRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly logger: ServiceGroupTimeSyncLogger = { error: () => undefined },
  ) {}

  async execute(input: UpdateServiceGroupInput): Promise<UpdateServiceGroupOutput> {
    const { actor, groupId } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], { action: 'service_group.manage', entityType: 'ServiceGroup' });

    const result = await this.serviceGroupRepo.findById(groupId, actor.tenantId);
    if (!result) {
      throw new ServiceGroupNotFoundError();
    }

    const { group, primaryTenantId } = result;

    // Guard: ACCEPTED groups are immutable
    if (group.status === 'ACCEPTED') {
      throw new ServiceGroupInvalidStatusError('DRAFT, PUBLISHED, or CANCELLED', 'ACCEPTED');
    }

    // Guard: draft-only fields require DRAFT status
    const hasDraftOnlyFields = DRAFT_ONLY_FIELDS.some(
      (field) => input[field] !== undefined,
    );
    if (hasDraftOnlyFields && group.status !== 'DRAFT') {
      throw new ServiceGroupNotDraftError();
    }

    // TZ-aware past-date/time validation when date or window changes (R7: falls back to UTC).
    if (input.scheduledDate !== undefined || input.timeWindow !== undefined) {
      // Service groups are cross-tenant (region-scoped) marketplace constructs whose
      // members may span agencies, so their schedule validation stays anchored to
      // the platform timezone (documented carve-out of the per-agency timezone work).
      const tz = PLATFORM_TIMEZONE;
      const existingDateStr = group.scheduledDate.toISOString().slice(0, 10);
      const scheduleCheck = validateEditedSchedule({
        existingDate: existingDateStr,
        existingTimeSlot: group.timeWindow,
        newDate: input.scheduledDate,
        newTimeSlot: input.timeWindow,
        tz,
      });
      if (!scheduleCheck.ok) {
        throw scheduleCheck.code === 'TIME_IN_PAST' ? new ServiceGroupTimeInPastError() : new ServiceGroupDateInPastError();
      }
    }

    // Build the update payload
    const updateData: Parameters<IServiceGroupRepository['update']>[1] = {};

    // Fields editable in any status
    if (input.regionName !== undefined) updateData.regionName = input.regionName;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.serviceRegionId !== undefined) updateData.serviceRegionId = input.serviceRegionId;

    // Draft-only fields
    if (input.scheduledDate !== undefined) {
      updateData.scheduledDate = new Date(input.scheduledDate);
    }
    if (input.timeWindow !== undefined) {
      updateData.timeWindow = input.timeWindow;
    }

    await this.serviceGroupRepo.update(groupId, updateData);

    // Members follow the group's date: when the (DRAFT-only) scheduledDate
    // changes, re-schedule every linked appointment to the new date.
    // Best-effort per member — the group update is already committed.
    if (updateData.scheduledDate !== undefined) {
      const groupScheduledDate = updateData.scheduledDate;
      for (const appt of result.appointments) {
        // Cancelling or rejecting an appointment does not unlink it from its
        // group — ExecuteStatusTransitionUseCase never touches serviceGroupId —
        // so a settled member can still be sitting here, and moving its date
        // would rewrite a record rather than plan work. The guard lives at this
        // caller rather than inside the helper because the group-join paths
        // sync while an appointment is still REJECTED, just before promoting it
        // to AWAITING_INSPECTOR.
        if (isTerminalAppointmentStatus(appt.status)) continue;

        // No time window: a date edit must leave every slot alone.
        await trySyncAppointmentScheduleToGroup({
          appointmentRepo: this.appointmentRepo,
          auditService: this.auditService,
          appointment: appt,
          groupScheduledDate,
          groupId,
          actor,
          logger: this.logger,
          reason: 'Service group date changed',
        });
      }
    }

    this.auditService.log({
      action: 'service_group.updated',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'ServiceGroup',
      entityId: groupId,
      tenantId: primaryTenantId,
      after: updateData,
    });

    const updated = await this.serviceGroupRepo.findById(groupId, actor.tenantId);
    /* istanbul ignore next -- defensive: findById should always return after successful update */
    const g = updated!.group;

    return {
      id: g.id,
      tenantId: updated!.primaryTenantId,
      serviceTypeId: g.serviceTypeId,
      status: g.status,
      groupSize: g.groupSize,
      offeredCount: g.offeredCount,
      confirmedCount: g.confirmedCount,
      scheduledDate: g.scheduledDate,
      timeWindow: g.timeWindow,
      regionName: g.regionName,
      description: g.description,
      assignedInspectorId: g.assignedInspectorId,
      serviceRegionId: g.serviceRegionId,
      publishedAt: g.publishedAt,
      assignedAt: g.assignedAt,
      createdByUserId: g.createdByUserId,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
    };
  }
}
