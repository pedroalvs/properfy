import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { IServiceGroupRepository } from '../../../service-group/domain/service-group.repository';

export interface GetAvailableGroupsInput {
  appointmentId: string;
}

export class GetAvailableGroupsUseCase {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly serviceGroupRepo: IServiceGroupRepository,
  ) {}

  /**
   * Returns ACCEPTED service groups that the tenant can join via the portal.
   * Available regardless of token expiry — group changes stay open while the
   * appointment is active.
   */
  async execute(input: GetAvailableGroupsInput): Promise<{ groups: Array<{
    groupId: string;
    scheduledDate: string;
    timeSlotStart: string;
    timeSlotEnd: string;
    suburb: string;
    inspectorName: string;
    confirmedCount: number;
    capacityMax: number;
  }> }> {
    const result = await this.appointmentRepo.findById(input.appointmentId, null);
    if (!result || !result.appointment.propertyId || !result.appointment.serviceTypeId) {
      return { groups: [] };
    }

    const { appointment } = result;
    const today = new Date();

    const rows = await this.serviceGroupRepo.findPortalEligibleSlots({
      tenantId: appointment.tenantId,
      serviceTypeId: appointment.serviceTypeId,
      propertyId: appointment.propertyId,
      today,
      excludeGroupId: appointment.serviceGroupId,
    });

    return {
      groups: rows.map((g) => ({
        groupId: g.groupId,
        scheduledDate: g.scheduledDate.toISOString().slice(0, 10),
        timeSlotStart: g.timeSlotStart,
        timeSlotEnd: g.timeSlotEnd,
        suburb: g.suburb,
        inspectorName: g.inspectorName,
        confirmedCount: g.confirmedCount,
        capacityMax: g.capacityMax,
      })),
    };
  }
}
