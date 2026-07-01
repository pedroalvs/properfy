import { ServiceTypeFlowType, RentalTenantConfirmationStatus, type AppointmentStatus } from '@properfy/shared';
import type { InspectorAppointment, InspectorAppointmentDetailResponse } from '../types';

function normalizeFlowType(flowType: string | null | undefined): ServiceTypeFlowType {
  if (flowType === ServiceTypeFlowType.INGOING || flowType === ServiceTypeFlowType.OUTGOING) {
    return flowType;
  }
  return ServiceTypeFlowType.ROUTINE;
}

function normalizeTenantConfirmation(status: string | null | undefined): RentalTenantConfirmationStatus {
  if (
    status === RentalTenantConfirmationStatus.CONFIRMED
    || status === RentalTenantConfirmationStatus.UNAVAILABLE
    || status === RentalTenantConfirmationStatus.NO_RESPONSE
  ) {
    return status;
  }
  return RentalTenantConfirmationStatus.PENDING;
}

export function mapInspectorAppointmentDetail(
  response: InspectorAppointmentDetailResponse,
): InspectorAppointment {
  const detail = response.data;

  return {
    id: detail.id,
    appointmentCode: detail.appointmentCode,
    propertyAddress: detail.propertyAddress,
    suburb: detail.suburb,
    scheduledDate: detail.scheduledDate,
    timeSlotStart: detail.timeSlotStart,
    timeSlotEnd: detail.timeSlotEnd,
    status: detail.status as AppointmentStatus,
    rentalTenantConfirmation: normalizeTenantConfirmation(detail.rentalTenantConfirmation),
    serviceTypeName: detail.serviceTypeName ?? 'Inspection',
    flowType: normalizeFlowType(detail.flowType),
    rentalTenantName: detail.rentalTenantName,
    rentalTenantPhone: detail.rentalTenantPhone,
    rentalTenantEmail: detail.rentalTenantEmail,
    keyRequired: detail.keyRequired,
    meetingLocation: detail.meetingLocation,
    restrictions: detail.restrictionsSummary,
    propertyLatitude: detail.propertyLatitude,
    propertyLongitude: detail.propertyLongitude,
    notes: detail.notes,
    observation: detail.observation,
    isOverdue: detail.isOverdue ?? false,
    agencyName: detail.agencyName,
    apps: detail.apps ?? [],
  };
}
