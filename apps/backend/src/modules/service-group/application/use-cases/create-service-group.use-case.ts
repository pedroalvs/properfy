import type { AuthContext, ServiceGroupExceptionType } from '@properfy/shared';
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
import { PriorityDateTooCloseError, ServiceRegionInactiveError } from '../../domain/service-group.errors';
import { NotFoundError } from '../../../../shared/domain/errors';
import type { PriorityMode } from '@properfy/shared';
import { SystemClock, type Clock } from '../../../../shared/domain/clock';

export interface CreateServiceGroupInput {
  appointmentIds: string[];
  serviceTypeId: string;
  scheduledDate: string; // YYYY-MM-DD
  timeWindow: string; // HH:mm-HH:mm
  name?: string;
  serviceRegionId?: string | null;
  description?: string;
  priorityMode: PriorityMode;
  exceptionType?: ServiceGroupExceptionType;
  exceptionReason?: string;
  actor: AuthContext;
}

export interface CreateServiceGroupOutput {
  id: string;
  tenantId: string;
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

    // 2. Load and validate appointments
    const appointments = [];
    let tenantId: string | null = null;

    for (const id of input.appointmentIds) {
      const result = await this.appointmentRepo.findById(id, actor.tenantId);
      if (!result) {
        throw new AppointmentNotFoundError();
      }
      const appt = result.appointment;

      // Determine tenantId from first appointment
      if (tenantId === null) {
        tenantId = appt.tenantId;
      }

      if (appt.tenantId !== tenantId) {
        throw new ValidationError('Appointments must belong to the same tenant');
      }

      appointments.push({
        id: appt.id,
        appointmentNumber: appt.appointmentNumber,
        status: appt.status,
        serviceTypeId: appt.serviceTypeId,
        tenantId: appt.tenantId,
        serviceGroupId: appt.serviceGroupId,
      });
    }

    // 3. Validate via domain validator
    ServiceGroupValidator.validate(appointments, input.serviceTypeId, tenantId!, input.exceptionType);

    // 4. Calculate priority expiry
    let priorityExpiresAt: Date | null = null;
    if (input.priorityMode === 'PRIORITY_24H') {
      // Read configurable priority hours from tenant settings, fallback to 24
      let priorityOfferHours = 24;
      if (this.tenantRepo) {
        const tenant = await this.tenantRepo.findById(tenantId!);
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

    // 5. Resolve service region — optional at create, required at publish (spec 005 FR-007).
    let serviceRegionId: string | null = null;
    let regionName: string | null = null;
    if (input.serviceRegionId) {
      const region = await this.serviceRegionRepo.findById(input.serviceRegionId, tenantId!);
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
      tenantId: tenantId!,
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
      exceptionType: input.exceptionType ?? null,
      exceptionReason: input.exceptionReason ?? null,
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
      tenantId: tenantId!,
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
      tenantId: group.tenantId,
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
