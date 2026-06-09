import type { ServiceGroupStatus, PriorityMode } from '@properfy/shared';

export interface AgencyRef {
  id: string;
  name: string;
}

export interface ServiceGroup {
  id: string;
  /** Null when the group spans multiple agencies (cross-agency group). */
  tenantId: string | null;
  /** Distinct agencies of the group's appointments (populated by the list/detail hooks). */
  agencies?: AgencyRef[];
  name: string | null;
  regionName: string | null;
  inspectorId: string | null;
  inspectorName: string | null;
  status: ServiceGroupStatus;
  priorityMode: PriorityMode;
  appointmentsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceGroupAppointment {
  id: string;
  appointmentNumber: number;
  status: string;
  scheduledDate: string | null;
  propertyAddress: string | null;
  propertyCode: string | null;
}

export interface ServiceGroupDetail extends ServiceGroup {
  appointments: ServiceGroupAppointment[];
  description: string | null;
}

export interface ServiceGroupFiltersState {
  status: string;
}

export const DEFAULT_FILTERS: ServiceGroupFiltersState = {
  status: '',
};

