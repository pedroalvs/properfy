import {
  GroupSizeTooSmallError,
  GroupSizeTooLargeError,
  AppointmentInvalidStatusError,
  AppointmentAlreadyInGroupError,
  ServiceTypeMismatchError,
} from './service-group.errors';

export interface AppointmentForValidation {
  id: string;
  status: string;
  serviceTypeId: string;
  tenantId: string;
  serviceGroupId: string | null;
}

export class ServiceGroupValidator {
  static validate(
    appointments: AppointmentForValidation[],
    expectedServiceTypeId: string,
    expectedTenantId: string,
  ): void {
    // Size constraints
    if (appointments.length < 5) {
      throw new GroupSizeTooSmallError(appointments.length);
    }
    if (appointments.length > 25) {
      throw new GroupSizeTooLargeError(appointments.length);
    }

    for (const appt of appointments) {
      // Status must be AWAITING_INSPECTOR
      if (appt.status !== 'AWAITING_INSPECTOR') {
        throw new AppointmentInvalidStatusError(appt.id);
      }

      // Must not already be in a group
      if (appt.serviceGroupId !== null) {
        throw new AppointmentAlreadyInGroupError(appt.id);
      }

      // Must match the expected service type
      if (appt.serviceTypeId !== expectedServiceTypeId) {
        throw new ServiceTypeMismatchError();
      }
    }
  }
}
