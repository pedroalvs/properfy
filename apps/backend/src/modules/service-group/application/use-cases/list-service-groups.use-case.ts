import { isPlottablePoint, type AuthContext } from '@properfy/shared';
import type { AuthorizationService } from '../../../../shared/domain/authorization.service';
import type {
  IServiceGroupRepository,
  ServiceGroupFilters,
  PaginationParams,
  ServiceGroupMapAppointment,
} from '../../domain/service-group.repository';

export interface ListServiceGroupsInput {
  filters: {
    tenantId?: string;
    status?: string[];
    serviceTypeId?: string;
    scheduledDateFrom?: string;
    scheduledDateTo?: string;
    /** When true, output items include `appointments[]` with property
     *  coordinates + inspector name. Used by the map page. */
    includeAppointments?: boolean;
    search?: string;
    branchId?: string;
    contactSearch?: string;
  };
  pagination: PaginationParams;
  actor: AuthContext;
}

export interface ServiceGroupSummaryAppointment {
  id: string;
  code: string;
  status: string;
  address: string;
  latitude: number;
  longitude: number;
  scheduledDate: string;
  inspectorName: string | null;
}

export interface ServiceGroupSummary {
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
  regionName: string | null;
  description: string | null;
  assignedInspectorId: string | null;
  assignedInspectorName: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  appointmentsCount?: number;
  appointments?: ServiceGroupSummaryAppointment[];
}

export interface ListServiceGroupsOutput {
  data: ServiceGroupSummary[];
  total: number;
}

export class ListServiceGroupsUseCase {
  constructor(
    private readonly serviceGroupRepo: IServiceGroupRepository,
    private readonly authorizationService: AuthorizationService,
  ) {}

  async execute(input: ListServiceGroupsInput): Promise<ListServiceGroupsOutput> {
    const { actor, filters, pagination } = input;

    this.authorizationService.assertRoles(actor, ['AM', 'OP'], { action: 'service_group.manage', entityType: 'ServiceGroup' });

    // includeAppointments is a use-case flag; everything else flows to the repo.
    const { includeAppointments, ...repoLevelFilters } = filters;
    const repoFilters: ServiceGroupFilters = { ...repoLevelFilters };

    // OP is scoped to their tenant
    if (actor.role === 'OP' && actor.tenantId) {
      repoFilters.tenantId = actor.tenantId;
    }

    const [data, total] = await Promise.all([
      this.serviceGroupRepo.findAll(repoFilters, pagination),
      this.serviceGroupRepo.count(repoFilters),
    ]);

    // Optionally batch-fetch appointments for the map page.
    let appointmentsByGroup: Map<string, ServiceGroupMapAppointment[]> = new Map();
    if (includeAppointments && data.length > 0) {
      const groupIds = data.map(({ group }) => group.id);
      const flat = await this.serviceGroupRepo.findAppointmentsForMapByGroupIds(groupIds);
      appointmentsByGroup = flat.reduce((acc, appt) => {
        const arr = acc.get(appt.serviceGroupId);
        if (arr) arr.push(appt);
        else acc.set(appt.serviceGroupId, [appt]);
        return acc;
      }, new Map<string, ServiceGroupMapAppointment[]>());
    }

    return {
      data: data.map(({ group: g, assignedInspectorName, primaryTenantId, agencies }) => {
        const appointments = appointmentsByGroup.get(g.id);
        return {
          id: g.id,
          groupNumber: g.groupNumber,
          code: String(g.groupNumber),
          tenantId: primaryTenantId,
          agencies,
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
          assignedInspectorName,
          publishedAt: g.publishedAt,
          createdAt: g.createdAt,
          updatedAt: g.updatedAt,
          // Every LINKED appointment, including un-geocoded ones. Emitted
          // unconditionally: it is the same derived count as `groupSize`, so it
          // costs nothing, and a consumer that only sometimes receives it
          // cannot tell "no appointments" from "the server didn't say".
          appointmentsCount: g.groupSize,
          ...(includeAppointments
            ? {
                // Only the PLOTTABLE subset, so a consumer can tell
                // "3 appointments, none mappable" apart from "no appointments
                // at all" — different problems, different fixes. Filtered with
                // the shared predicate rather than a looser `!= null`: the map
                // rejects non-finite and out-of-range coordinates too, and a
                // payload that advertises a subset its only reader disagrees
                // with is the bug this filter exists to prevent.
                appointments: (appointments ?? [])
                  .filter(isPlottablePoint)
                  .map((a) => ({
                    id: a.id,
                    code: a.code,
                    status: a.status,
                    address: a.address,
                    latitude: a.latitude,
                    longitude: a.longitude,
                    scheduledDate: a.scheduledDate.toISOString(),
                    inspectorName: a.inspectorName,
                  })),
              }
            : {}),
        };
      }),
      total,
    };
  }
}
