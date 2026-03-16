export interface AppointmentContactProps {
  id: string;
  appointmentId: string;
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
    this.tenantName = props.tenantName;
    this.primaryEmail = props.primaryEmail;
    this.secondaryEmail = props.secondaryEmail;
    this.primaryPhone = props.primaryPhone;
    this.secondaryPhone = props.secondaryPhone;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
