import type { AuthContext, ServiceGroupExceptionType } from '@properfy/shared';
import { ForbiddenError, ValidationError } from '../../../../shared/domain/errors';
import type { AuditService } from '../../../../shared/infrastructure/audit';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import { ServiceGroupEntity } from '../../domain/service-group.entity';
import { ServiceGroupValidator } from '../../domain/service-group.validator';
import { AppointmentNotFoundError } from '../../../appointment/domain/appointment.errors';
import { PriorityDateTooCloseError } from '../../domain/service-group.errors';
import type { PriorityMode } from '@properfy/shared';

export interface CreateServiceGroupInput {
  appointmentIds: string[];
  serviceTypeId: string;
  scheduledDate: string; // YYYY-MM-DD
  timeWindow: string; // HH:mm-HH:mm
  name?: string;
  regionName?: string;
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
  ) {}

  async execute(input: CreateServiceGroupInput): Promise<CreateServiceGroupOutput> {
    const { actor } = input;

    // 1. RBAC
    if (actor.role !== 'AM' && actor.role !== 'OP') {
      throw new ForbiddenError('AUTH_FORBIDDEN', 'Insufficient permissions');
    }

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
      const scheduledDate = new Date(input.scheduledDate);
      priorityExpiresAt = new Date(scheduledDate.getTime() - 24 * 60 * 60 * 1000);

      // Validate scheduled date is at least 24h from now
      const now = new Date();
      if (scheduledDate.getTime() - now.getTime() < 24 * 60 * 60 * 1000) {
        throw new PriorityDateTooCloseError();
      }
    }

    // 5. Create entity
    const now = new Date();
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
      regionName: input.regionName ?? null,
      description: input.description ?? null,
      priorityMode: input.priorityMode,
      priorityExpiresAt,
      exceptionType: input.exceptionType ?? null,
      exceptionReason: input.exceptionReason ?? null,
      assignedInspectorId: null,
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

    const draftIds = appointments
      .filter((appt) => appt.status === 'DRAFT')
      .map((appt) => appt.id);

    for (const id of draftIds) {
      await this.appointmentRepo.update(id, appointments.find((a) => a.id === id)!.tenantId, {
        status: 'AWAITING_INSPECTOR',
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
      publishedAt: group.publishedAt,
      assignedAt: group.assignedAt,
      createdByUserId: group.createdByUserId,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
    };
  }
}
