import type { ServiceGroupExceptionType } from '@properfy/shared';
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

/**
 * Size limits that apply when a service group exception type is declared.
 * Without an exception: min=5, max=25.
 *
 * See: projeto-consolidado/service-group-exceptions.md for the full rationale
 * and migration path to automatic (Scenario 1) exceptions.
 */
const EXCEPTION_LIMITS: Record<ServiceGroupExceptionType, { min: number; max: number }> = {
  LOW_DENSITY_REGION: { min: 1, max: 25 },
  ISOLATED_SERVICE:   { min: 1, max: 3  },
  PRIORITY_CLIENT:    { min: 1, max: 8  },
};

const DEFAULT_LIMITS = { min: 5, max: 25 };

export class ServiceGroupValidator {
  static validate(
    appointments: AppointmentForValidation[],
    expectedServiceTypeId: string,
    expectedTenantId: string,
    exceptionType?: ServiceGroupExceptionType | null,
  ): void {
    const limits = exceptionType ? EXCEPTION_LIMITS[exceptionType] : DEFAULT_LIMITS;

    if (appointments.length < limits.min) {
      throw new GroupSizeTooSmallError(appointments.length);
    }
    if (appointments.length > limits.max) {
      throw new GroupSizeTooLargeError(appointments.length);
    }

    for (const appt of appointments) {
      // Status must be DRAFT or AWAITING_INSPECTOR (grouping transitions DRAFT → AWAITING_INSPECTOR)
      if (appt.status !== 'AWAITING_INSPECTOR' && appt.status !== 'DRAFT') {
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
