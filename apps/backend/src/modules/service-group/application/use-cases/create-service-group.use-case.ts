import type { AuthContext } from '@properfy/shared';
import { ValidationError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { IServiceRegionRepository } from '../../../service-region/domain/service-region.repository';
import type { ITenantRepository } from '../../../tenant/domain/tenant.repository';
import { ServiceGroupEntity } from '../../domain/service-group.entity';
import { ServiceGroupValidator } from '../../domain/service-group.validator';
import { AppointmentNotFoundError } from '../../../appointment/domain/appointment.errors';
import { PriorityDateTooCloseError, ServiceRegionInactiveError, ServiceGroupDateInPastError, ServiceGroupTimeInPastError } from '../../domain/service-group.errors';
import { validateNewSchedule } from '@properfy/shared';
import { NotFoundError } from '../../../../shared/domain/errors';
import type { PriorityMode } from '@properfy/shared';
import { SystemClock, type Clock } from '../../../../shared/domain/clock';
import { trySyncAppointmentTimeSlotToGroup } from '../sync-appointment-time-slot-to-group';

export interface CreateServiceGroupInput {
  appointmentIds: string[];
  serviceTypeId: string;
  scheduledDate: string; // YYYY-MM-DD
  timeWindow: string; // HH:mm-HH:mm
  name?: string;
  serviceRegionId?: string | null;
  description?: string;
  priorityMode: PriorityMode;
  actorTimezone?: string;
  actor: AuthContext;
}

export interface CreateServiceGroupOutput {
  id: string;
  groupNumber: number;
  code: string;
  tenantId: string | null;
  serviceTypeId: string;
  status: string;
  groupSize: number;
  offeredCount: number;
  confirmedCount: number;
  scheduledDate: Date;
  timeWindow: string;
  name: string | null;
  regionName: string | null;
  description: string | null;
  priorityMode: string;
  priorityExpiresAt: Date | null;
  assignedInspectorId: string | null;
  serviceRegionId: string | null;
  publishedAt: Date | null;
  assignedAt: Date | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export class CreateServiceGroupUseCase {
  constructor(
    private readonly serviceGroupRepo: IServiceGroupRepository,
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly auditService: AuditService,
    private readonly authorizationService: AuthorizationService,
    private readonly serviceRegionRepo: IServiceRegionRepository,
    private readonly tenantRepo?: ITenantRepository,
    private readonly clock: Clock = new SystemClock(),
  ) {}

  async execute(input: CreateServiceGroupInput): Promise<CreateServiceGroupOutput> {
    const { actor } = input;

    // 1. RBAC
    this.authorizationService.assertRoles(actor, ['AM', 'OP'], { action: 'service_group.create', entityType: 'ServiceGroup' });

    // 1b. TZ-aware past-date/time validation (R7: falls back to UTC when tz absent).
    const tz = input.actorTimezone ?? 'UTC';
    const scheduleCheck = validateNewSchedule({ date: input.scheduledDate, timeSlot: input.timeWindow, tz });
    if (!scheduleCheck.ok) {
      throw scheduleCheck.code === 'TIME_IN_PAST' ? new ServiceGroupTimeInPastError() : new ServiceGroupDateInPastError();
    }

    // 2. Load appointments. Groups are tenant-agnostic — a group may span
    //    multiple agencies; the tenant lives on each appointment. Only AM/OP
    //    (cross-tenant, asserted above) reach here, so look up appointments
    //    cross-tenant: scoping to actor.tenantId would silently exclude other
    //    agencies' appointments and break cross-agency group creation.
    const appointments = [];

    for (const id of input.appointmentIds) {
      const result = await this.appointmentRepo.findById(id, null);
      if (!result) {
        throw new AppointmentNotFoundError();
      }
      const appt = result.appointment;

      appointments.push({
        id: appt.id,
        appointmentNumber: appt.appointmentNumber,
        status: appt.status,
        serviceTypeId: appt.serviceTypeId,
        tenantId: appt.tenantId,
        serviceGroupId: appt.serviceGroupId,
        timeSlotStart: appt.timeSlotStart,
        timeSlotEnd: appt.timeSlotEnd,
      });
    }

    // Derive the group's tenant set: a single agency, or null when mixed.
    const tenantIds = [...new Set(appointments.map((a) => a.tenantId))];
    const primaryTenantId = tenantIds.length === 1 ? tenantIds[0]! : null;

    // 3. Validate via domain validator (status / service type / not-already-grouped)
    ServiceGroupValidator.validate(appointments, input.serviceTypeId);

    // 4. Calculate priority expiry
    let priorityExpiresAt: Date | null = null;
    if (input.priorityMode === 'PRIORITY_24H') {
      // Read configurable priority hours from the agency's settings (single-agency
      // groups only); mixed-agency groups fall back to the platform default of 24h.
      let priorityOfferHours = 24;
      if (this.tenantRepo && primaryTenantId) {
        const tenant = await this.tenantRepo.findById(primaryTenantId);
        if (tenant?.settingsJson && typeof tenant.settingsJson.priorityOfferHours === 'number') {
          priorityOfferHours = tenant.settingsJson.priorityOfferHours;
        }
      }

      const scheduledDate = new Date(input.scheduledDate);
      priorityExpiresAt = new Date(scheduledDate.getTime() - priorityOfferHours * 60 * 60 * 1000);

      // Validate scheduled date is at least priorityOfferHours from now
      const now = this.clock.now();
      if (scheduledDate.getTime() - now.getTime() < priorityOfferHours * 60 * 60 * 1000) {
        throw new PriorityDateTooCloseError();
      }
    }

    // 5. Resolve service region — optional at create, required at publish for
    //    single-agency groups (spec 005 FR-007). A mixed-agency group cannot
    //    carry a single group-level region; it relies on per-appointment region
    //    matching in the marketplace. Region ownership is cross-tenant
    //    (`sr.tenant_id` is not a matching filter), so any active region may be
    //    attached regardless of which agency owns it — look it up by id only.
    let serviceRegionId: string | null = null;
    let regionName: string | null = null;
    if (input.serviceRegionId) {
      if (!primaryTenantId) {
        throw new ValidationError('A service region cannot be assigned to a group spanning multiple agencies');
      }
      const region = await this.serviceRegionRepo.findById(input.serviceRegionId, null);
      if (!region) {
        throw new NotFoundError('SERVICE_REGION_NOT_FOUND', 'Service region not found');
      }
      if (region.status !== 'ACTIVE') {
        throw new ServiceRegionInactiveError();
      }
      serviceRegionId = region.id;
      regionName = region.name;
    }

    // 6. Create entity
    const now = this.clock.now();
    const groupId = crypto.randomUUID();

    const group = new ServiceGroupEntity({
      id: groupId,
      serviceTypeId: input.serviceTypeId,
      status: 'DRAFT',
      groupSize: input.appointmentIds.length,
      offeredCount: 0,
      confirmedCount: 0,
      scheduledDate: new Date(input.scheduledDate),
      timeWindow: input.timeWindow,
      name: input.name ?? null,
      regionName,
      description: input.description ?? null,
      priorityMode: input.priorityMode,
      priorityExpiresAt,
      assignedInspectorId: null,
      serviceRegionId,
      publishedAt: null,
      assignedAt: null,
      createdByUserId: actor.userId,
      createdAt: now,
      updatedAt: now,
    });

    // 6. Save group
    await this.serviceGroupRepo.save(group);

    // 7. Link appointments to group and transition DRAFT ones to AWAITING_INSPECTOR
    await this.serviceGroupRepo.linkAppointments(input.appointmentIds, groupId);

    for (const appt of appointments) {
      await trySyncAppointmentTimeSlotToGroup({
        appointmentRepo: this.appointmentRepo,
        auditService: this.auditService,
        appointment: appt,
        groupTimeWindow: input.timeWindow,
        groupId,
        actor,
      });
    }

    const transitionIds = appointments
      .filter((appt) => appt.status === 'DRAFT' || appt.status === 'REJECTED')
      .map((appt) => ({ id: appt.id, prevStatus: appt.status, tenantId: appt.tenantId }));

    for (const { id, prevStatus, tenantId: apptTenantId } of transitionIds) {
      await this.appointmentRepo.update(id, apptTenantId, { status: 'AWAITING_INSPECTOR' });
      // DRAFT→AWAITING_INSPECTOR rule = OP+SYS (system-triggered); REJECTED→AWAITING_INSPECTOR rule = OP+AM (actor-driven).
      this.auditService.log({
        action: 'appointment.status_transition',
        actorType: prevStatus === 'DRAFT' ? 'SYSTEM' : 'USER',
        actorId: actor.userId,
        entityType: 'Appointment',
        entityId: id,
        tenantId: apptTenantId,
        before: { status: prevStatus },
        after: { status: 'AWAITING_INSPECTOR' },
        reason: 'Added to service group',
        metadata: { systemTriggered: prevStatus === 'DRAFT', groupId, previousStatus: prevStatus },
      });
    }

    // 8. Audit log
    this.auditService.log({
      action: 'service_group.created',
      actorType: 'USER',
      actorId: actor.userId,
      entityType: 'ServiceGroup',
      entityId: groupId,
      tenantId: primaryTenantId,
      after: {
        id: groupId,
        status: 'DRAFT',
        groupSize: input.appointmentIds.length,
        serviceTypeId: input.serviceTypeId,
        scheduledDate: input.scheduledDate,
        priorityMode: input.priorityMode,
      },
    });

    return {
      id: group.id,
      groupNumber: group.groupNumber,
      code: String(group.groupNumber),
      tenantId: primaryTenantId,
      serviceTypeId: group.serviceTypeId,
      status: group.status,
      groupSize: group.groupSize,
      offeredCount: group.offeredCount,
      confirmedCount: group.confirmedCount,
      scheduledDate: group.scheduledDate,
      timeWindow: group.timeWindow,
      name: group.name,
      regionName: group.regionName,
      description: group.description,
      priorityMode: group.priorityMode,
      priorityExpiresAt: group.priorityExpiresAt,
      assignedInspectorId: group.assignedInspectorId,
      serviceRegionId: group.serviceRegionId,
      publishedAt: group.publishedAt,
      assignedAt: group.assignedAt,
      createdByUserId: group.createdByUserId,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }
}
