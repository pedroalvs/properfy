import { ServiceTypeFlowType, TenantConfirmationStatus, type AppointmentStatus } from '@properfy/shared';
import type { InspectorAppointment, InspectorAppointmentDetailResponse } from '../types';

function normalizeFlowType(flowType: string | null | undefined): ServiceTypeFlowType {
  if (flowType === ServiceTypeFlowType.INGOING || flowType === ServiceTypeFlowType.OUTGOING) {
    return flowType;
  }
  return ServiceTypeFlowType.ROUTINE;
}

function normalizeTenantConfirmation(status: string | null | undefined): TenantConfirmationStatus {
  if (
    status === TenantConfirmationStatus.CONFIRMED
    || status === TenantConfirmationStatus.UNAVAILABLE
    || status === TenantConfirmationStatus.NO_RESPONSE
  ) {
    return status;
  }
  return TenantConfirmationStatus.PENDING;
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
    tenantConfirmation: normalizeTenantConfirmation(detail.tenantConfirmation),
    serviceTypeName: detail.serviceTypeName ?? 'Inspection',
    flowType: normalizeFlowType(detail.flowType),
    tenantName: detail.tenantName,
    tenantPhone: detail.tenantPhone,
    tenantEmail: detail.tenantEmail,
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
