import type { PropertyIssueSource } from '@properfy/shared';

/** A property issue row (camelCase domain view of `property_issues`). */
export interface PropertyIssueEntity {
  id: string;
  tenantId: string;
  propertyId: string;
  appointmentId: string | null;
  reason: string;
  source: PropertyIssueSource;
  createdByUserId: string | null;
  cantDoEventId: string | null;
  seenAt: Date | null;
  seenByUserId: string | null;
  deletedAt: Date | null;
  deletedByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Input to persist a new issue. */
export interface NewPropertyIssue {
  id: string;
  tenantId: string;
  propertyId: string;
  appointmentId: string | null;
  reason: string;
  source: PropertyIssueSource;
  createdByUserId: string | null;
  cantDoEventId: string | null;
  createdAt: Date;
}

/** The property/tenant an appointment belongs to (validation lookup). */
export interface AppointmentScope {
  propertyId: string | null;
  tenantId: string;
}

/** The scope of an inspector field event (for cant_do_event_id validation). */
export interface InspectorFieldEventScope {
  appointmentId: string;
  inspectorId: string;
  tenantId: string;
  type: string;
}
