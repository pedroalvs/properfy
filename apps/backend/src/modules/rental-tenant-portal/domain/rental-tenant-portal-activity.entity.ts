import type { RentalTenantPortalAction } from '@properfy/shared';

export interface RentalTenantPortalActivityProps {
  id: string;
  appointmentId: string;
  rentalTenantPortalTokenId: string;
  action: RentalTenantPortalAction;
  previousValuesJson: Record<string, unknown> | null;
  newValuesJson: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export class RentalTenantPortalActivityEntity {
  readonly id: string;
  readonly appointmentId: string;
  readonly rentalTenantPortalTokenId: string;
  readonly action: RentalTenantPortalAction;
  readonly previousValuesJson: Record<string, unknown> | null;
  readonly newValuesJson: Record<string, unknown> | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly createdAt: Date;

  constructor(props: RentalTenantPortalActivityProps) {
    this.id = props.id;
    this.appointmentId = props.appointmentId;
    this.rentalTenantPortalTokenId = props.rentalTenantPortalTokenId;
    this.action = props.action;
    this.previousValuesJson = props.previousValuesJson;
    this.newValuesJson = props.newValuesJson;
    this.ipAddress = props.ipAddress;
    this.userAgent = props.userAgent;
    this.createdAt = props.createdAt;
  }
}
