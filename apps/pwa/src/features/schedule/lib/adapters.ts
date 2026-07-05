import { ServiceTypeFlowType, RentalTenantConfirmationStatus } from '@properfy/shared';
import type {
  InspectorAppointment,
  InspectorAppointmentDetailResponse,
  InspectorScheduleMonthItem,
} from '../types';

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
    status: detail.status,
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
    propertyAddressLine2: detail.propertyAddressLine2 ?? null,
    propertyType: detail.propertyType ?? null,
    propertyPrivateAreaM2: detail.propertyPrivateAreaM2 ?? null,
    propertyTotalAreaM2: detail.propertyTotalAreaM2 ?? null,
    propertyFurnished: detail.propertyFurnished ?? null,
    propertyLinenProvided: detail.propertyLinenProvided ?? null,
    notes: detail.notes,
    observation: detail.observation,
    customFields: detail.customFields ?? [],
    isOverdue: detail.isOverdue ?? false,
    agencyName: detail.agencyName,
    apps: detail.apps ?? [],
  };
}

export function mapInspectorScheduleMonthItem(item: InspectorScheduleMonthItem): InspectorAppointment {
  return {
    id: item.id,
    appointmentCode: item.appointmentCode,
    propertyAddress: item.propertyAddress,
    suburb: item.suburb,
    scheduledDate: item.scheduledDate,
    timeSlotStart: item.timeSlotStart,
    timeSlotEnd: item.timeSlotEnd,
    status: item.status,
    rentalTenantConfirmation: normalizeTenantConfirmation(item.rentalTenantConfirmationStatus),
    serviceTypeName: item.serviceTypeName,
    flowType: normalizeFlowType(item.flowType),
    rentalTenantName: '',
    rentalTenantPhone: null,
    rentalTenantEmail: null,
    keyRequired: item.keyRequired,
    meetingLocation: item.meetingLocation,
    restrictions: null,
    propertyLatitude: null,
    propertyLongitude: null,
    notes: null,
    observation: null,
    customFields: [],
    isOverdue: item.isOverdue ?? false,
    agencyName: item.agencyName ?? undefined,
    apps: [],
  };
}
