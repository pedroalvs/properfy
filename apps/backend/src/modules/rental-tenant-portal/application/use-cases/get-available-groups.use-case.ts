import type { IAppointmentRepository } from '../../../appointment/domain/appointment.repository';
import type { IServiceGroupRepository } from '../../../service-group/domain/service-group.repository';
import { buildPortalEligibleSlots } from '../../../service-group/domain/portal-slot-capacity';

export interface GetAvailableGroupsInput {
  appointmentId: string;
}

export class GetAvailableGroupsUseCase {
  constructor(
    private readonly appointmentRepo: IAppointmentRepository,
    private readonly serviceGroupRepo: IServiceGroupRepository,
  ) {}

  /**
   * Returns the time windows of ACCEPTED service groups the tenant can join via
   * the portal, each with how much of it is already taken. Windows with no room
   * left under the 2-inspections-per-hour rule are not offered at all.
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
    bookedCount: number;
    capacityMax: number;
  }> }> {
    const result = await this.appointmentRepo.findById(input.appointmentId, null);
    if (!result || !result.appointment.propertyId || !result.appointment.serviceTypeId) {
      return { groups: [] };
    }

    const { appointment } = result;
    const today = new Date();

    const members = await this.serviceGroupRepo.findPortalEligibleSlots({
      tenantId: appointment.tenantId,
      serviceTypeId: appointment.serviceTypeId,
      propertyId: appointment.propertyId,
      today,
      excludeGroupId: appointment.serviceGroupId,
    });

    return {
      groups: buildPortalEligibleSlots(members).map((slot) => ({
        groupId: slot.groupId,
        scheduledDate: slot.scheduledDate.toISOString().slice(0, 10),
        timeSlotStart: slot.timeSlotStart,
        timeSlotEnd: slot.timeSlotEnd,
        suburb: slot.suburb,
        inspectorName: slot.inspectorName,
        bookedCount: slot.bookedCount,
        capacityMax: slot.capacityMax,
      })),
    };
  }
}
