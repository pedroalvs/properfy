import type { AppointmentContactRole } from '@properfy/shared';

export interface AppointmentContactProps {
  id: string;
  appointmentId: string;
  // Junction fields (new — feature 021)
  contactId: string | null;
  role: AppointmentContactRole;
  isPrimary: boolean;
  snapshotName: string | null;
  snapshotEmail: string | null;
  snapshotPhone: string | null;
  // Legacy fields (kept during expand phase — read-only, will be dropped in a future migration)
  tenantName: string;
  primaryEmail: string | null;
  secondaryEmail: string | null;
  primaryPhone: string | null;
  secondaryPhone: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class AppointmentContactEntity {
  readonly id: string;
  readonly appointmentId: string;
  // Junction fields
  readonly contactId: string | null;
  readonly role: AppointmentContactRole;
  readonly isPrimary: boolean;
  readonly snapshotName: string | null;
  readonly snapshotEmail: string | null;
  readonly snapshotPhone: string | null;
  // Legacy fields
  readonly tenantName: string;
  readonly primaryEmail: string | null;
  readonly secondaryEmail: string | null;
  readonly primaryPhone: string | null;
  readonly secondaryPhone: string | null;
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
    this.tenantName = props.tenantName;
    this.primaryEmail = props.primaryEmail;
    this.secondaryEmail = props.secondaryEmail;
    this.primaryPhone = props.primaryPhone;
    this.secondaryPhone = props.secondaryPhone;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  /** Resolve the effective display name: snapshot if available, legacy fallback */
  get effectiveName(): string {
    return this.snapshotName ?? this.tenantName;
  }

  /** Resolve the effective email: snapshot if available, legacy fallback */
  get effectiveEmail(): string | null {
    return this.snapshotEmail ?? this.primaryEmail;
  }

  /** Resolve the effective phone: snapshot if available, legacy fallback */
  get effectivePhone(): string | null {
    return this.snapshotPhone ?? this.primaryPhone;
  }
}
