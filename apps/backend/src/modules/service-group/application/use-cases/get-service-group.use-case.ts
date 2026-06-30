import type { AuthContext } from '@properfy/shared';
import type { IServiceGroupRepository } from '../../domain/service-group.repository';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { ServiceGroupNotFoundError } from '../../domain/service-group.errors';

export interface GetServiceGroupInput {
  groupId: string;
  actor: AuthContext;
}

export interface GetServiceGroupOutput {
  id: string;
  groupNumber: number;
  code: string;
  tenantId: string | null;
  agencies: Array<{ id: string; name: string }>;
  serviceTypeId: string;
  status: string;
  groupSize: number;
  offeredCount: number;
  confirmedCount: number;
  scheduledDate: Date;
  timeWindow: string;
  name: string | null;
  serviceRegionId: string | null;
  regionName: string | null;
  description: string | null;
  priorityMode: string;
  priorityExpiresAt: Date | null;
  assignedInspectorId: string | null;
  assignedInspectorName: string | null;
  publishedAt: Date | null;
  assignedAt: Date | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  appointments: Array<{
    id: string;
    appointmentNumber: number;
    status: string;
    propertyId: string;
    scheduledDate: Date;
    propertyAddress: string | null;
    propertyCode: string | null;
  }>;
}

export class GetServiceGroupUseCase {
  constructor(
    private readonly serviceGroupRepo: IServiceGroupRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: GetServiceGroupInput): Promise<GetServiceGroupOutput> {
    const { actor, groupId } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], { action: 'service_group.manage', entityType: 'ServiceGroup' });

    const result = await this.serviceGroupRepo.findById(groupId, actor.tenantId);
    if (!result) {
      throw new ServiceGroupNotFoundError();
    }

    const { group, assignedInspectorName, appointments, primaryTenantId, agencies } = result;

    return {
      id: group.id,
      groupNumber: group.groupNumber,
      code: String(group.groupNumber),
      tenantId: primaryTenantId,
      agencies,
      serviceTypeId: group.serviceTypeId,
      status: group.status,
      groupSize: group.groupSize,
      offeredCount: group.offeredCount,
      confirmedCount: group.confirmedCount,
      scheduledDate: group.scheduledDate,
      timeWindow: group.timeWindow,
      name: group.name,
      serviceRegionId: group.serviceRegionId,
      regionName: group.regionName,
      description: group.description,
      priorityMode: group.priorityMode,
      priorityExpiresAt: group.priorityExpiresAt,
      assignedInspectorId: group.assignedInspectorId,
      assignedInspectorName: assignedInspectorName ?? null,
      publishedAt: group.publishedAt,
      assignedAt: group.assignedAt,
      createdByUserId: group.createdByUserId,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      appointments: appointments.map((a) => ({
        id: a.id,
        appointmentNumber: a.appointmentNumber,
        status: a.status,
        propertyId: a.propertyId,
        scheduledDate: a.scheduledDate,
        propertyAddress: a.propertyAddress,
        propertyCode: a.propertyCode,
      })),
    };
  }
}
