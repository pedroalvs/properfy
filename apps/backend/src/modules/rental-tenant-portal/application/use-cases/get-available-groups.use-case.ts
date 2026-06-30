import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { IServiceGroupRepository } from '../../../service-group/domain/service-group.repository';

export interface GetAvailableGroupsInput {
  appointmentId: string;
  isReadOnly: boolean;
}

export class GetAvailableGroupsUseCase {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly serviceGroupRepo: IServiceGroupRepository,
  ) {}

  /**
   * Returns ACCEPTED service groups that the tenant can join via the portal.
   * Returns an empty list when the token is past the cutoff (isReadOnly = true).
   */
  async execute(input: GetAvailableGroupsInput): Promise<{ groups: Array<{
    id: string;
    scheduledDate: string;
    timeWindow: string;
    suburb: string;
    inspectorName: string;
    confirmedCount: number;
    capacityMax: number;
  }> }> {
    if (input.isReadOnly) {
      return { groups: [] };
    }

    const result = await this.appointmentRepo.findById(input.appointmentId, null);
    if (!result || !result.appointment.propertyId || !result.appointment.serviceTypeId) {
      return { groups: [] };
    }

    const { appointment } = result;
    const today = new Date();

    const rows = await this.serviceGroupRepo.findPortalEligibleGroups({
      tenantId: appointment.tenantId,
      serviceTypeId: appointment.serviceTypeId,
      propertyId: appointment.propertyId,
      today,
    });

    return {
      groups: rows.map((g) => ({
        id: g.id,
        scheduledDate: g.scheduledDate.toISOString().slice(0, 10),
        timeWindow: g.timeWindow,
        suburb: g.suburb,
        inspectorName: g.inspectorName,
        confirmedCount: g.confirmedCount,
        capacityMax: g.capacityMax,
      })),
    };
  }
}
