import type { RestrictionSource } from '@properfy/shared';

export interface AppointmentRestrictionProps {
  id: string;
  appointmentId: string;
  isHome: boolean;
  unavailableDaysJson: string[] | null;
  unavailableHoursJson: string[] | null;
  notes: string | null;
  source: RestrictionSource;
  createdAt: Date;
  updatedAt: Date;
}

export class AppointmentRestrictionEntity {
  readonly id: string;
  readonly appointmentId: string;
  readonly isHome: boolean;
  readonly unavailableDaysJson: string[] | null;
  readonly unavailableHoursJson: string[] | null;
  readonly notes: string | null;
  readonly source: RestrictionSource;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: AppointmentRestrictionProps) {
    this.id = props.id;
    this.appointmentId = props.appointmentId;
    this.isHome = props.isHome;
    this.unavailableDaysJson = props.unavailableDaysJson;
    this.unavailableHoursJson = props.unavailableHoursJson;
    this.notes = props.notes;
    this.source = props.source;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
