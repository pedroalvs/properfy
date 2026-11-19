import type { InspectorFieldEventType } from '@properfy/shared';

export interface InspectorFieldEventProps {
  id: string;
  appointmentId: string;
  inspectorId: string;
  tenantId: string;
  type: InspectorFieldEventType;
  reasonCode: string;
  note: string | null;
  minutes: number | null;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  clientOccurredAt: Date | null;
  createdAt: Date;
}

/**
 * Immutable record that an inspector reported something from the field
 * (CANT_DO / LATE_NOTICE). No mutation methods — events are append-only.
 */
export class InspectorFieldEventEntity {
  readonly id: string;
  readonly appointmentId: string;
  readonly inspectorId: string;
  readonly tenantId: string;
  readonly type: InspectorFieldEventType;
  readonly reasonCode: string;
  readonly note: string | null;
  readonly minutes: number | null;
  readonly latitude: number | null;
  readonly longitude: number | null;
  readonly accuracyMeters: number | null;
  readonly clientOccurredAt: Date | null;
  readonly createdAt: Date;

  constructor(props: InspectorFieldEventProps) {
    this.id = props.id;
    this.appointmentId = props.appointmentId;
    this.inspectorId = props.inspectorId;
    this.tenantId = props.tenantId;
    this.type = props.type;
    this.reasonCode = props.reasonCode;
    this.note = props.note;
    this.minutes = props.minutes;
    this.latitude = props.latitude;
    this.longitude = props.longitude;
    this.accuracyMeters = props.accuracyMeters;
    this.clientOccurredAt = props.clientOccurredAt;
    this.createdAt = props.createdAt;
  }
}

/** Latest CANT_DO per appointment, joined to the inspector name (list/detail projection). */
export interface LatestCantDo {
  appointmentId: string;
  reasonCode: string;
  note: string | null;
  inspectorId: string;
  inspectorName: string | null;
  occurredAt: Date;
}

/** A field event joined to the inspector name — the field-activity read projection. */
export interface FieldEventRecord {
  id: string;
  type: InspectorFieldEventType;
  reasonCode: string;
  note: string | null;
  minutes: number | null;
  inspectorName: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracyMeters: number | null;
  clientOccurredAt: Date | null;
  occurredAt: Date;
}
