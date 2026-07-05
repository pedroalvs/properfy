import type { AppointmentContactRole } from '@properfy/shared';

export interface AppointmentContactProps {
  id: string;
  appointmentId: string;
  // Junction fields (feature 021)
  contactId: string | null;
  role: AppointmentContactRole;
  isPrimary: boolean;
  // Snapshot of the contact at link time (the authoritative contact data)
  snapshotName: string;
  snapshotEmail: string | null;
  snapshotPhone: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class AppointmentContactEntity {
  readonly id: string;
  readonly appointmentId: string;
  readonly contactId: string | null;
  readonly role: AppointmentContactRole;
  readonly isPrimary: boolean;
  readonly snapshotName: string;
  readonly snapshotEmail: string | null;
  readonly snapshotPhone: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: AppointmentContactProps) {
    this.id = props.id;
    this.appointmentId = props.appointmentId;
    this.contactId = props.contactId;
    this.role = props.role;
    this.isPrimary = props.isPrimary;
    this.snapshotName = props.snapshotName;
    this.snapshotEmail = props.snapshotEmail;
    this.snapshotPhone = props.snapshotPhone;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /** Effective display name — the contact snapshot. */
  get effectiveName(): string {
    return this.snapshotName;
  }

  /** Effective email — the contact snapshot. */
  get effectiveEmail(): string | null {
    return this.snapshotEmail;
  }

  /** Effective phone — the contact snapshot. */
  get effectivePhone(): string | null {
    return this.snapshotPhone;
  }
}
