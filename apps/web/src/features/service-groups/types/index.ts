import type { ServiceGroupStatus, PriorityMode, Agency } from '@properfy/shared';

// Re-exported so feature-local imports keep a single path; shape lives in @properfy/shared.
export type { Agency } from '@properfy/shared';

export interface ServiceGroup {
  id: string;
  /** Sequential human-friendly code (pure numeric). */
  groupNumber?: number;
  code?: string;
  /** Null when the group spans multiple agencies (cross-agency group). */
  tenantId: string | null;
  /** Distinct agencies of the group's appointments (populated by the list/detail hooks). */
  agencies?: Agency[];
  serviceRegionId: string | null;
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

