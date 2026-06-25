import type { TenantPortalAction } from '@properfy/shared';

export interface TenantPortalActivityProps {
  id: string;
  appointmentId: string;
  tenantPortalTokenId: string;
  action: TenantPortalAction;
  previousValuesJson: Record<string, unknown> | null;
  newValuesJson: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export class TenantPortalActivityEntity {
  readonly id: string;
  readonly appointmentId: string;
  readonly tenantPortalTokenId: string;
  readonly action: TenantPortalAction;
  readonly previousValuesJson: Record<string, unknown> | null;
  readonly newValuesJson: Record<string, unknown> | null;
  readonly ipAddress: string | null;
  readonly userAgent: string | null;
  readonly createdAt: Date;

  constructor(props: TenantPortalActivityProps) {
    this.id = props.id;
    this.appointmentId = props.appointmentId;
    this.tenantPortalTokenId = props.tenantPortalTokenId;
    this.action = props.action;
    this.previousValuesJson = props.previousValuesJson;
    this.newValuesJson = props.newValuesJson;
    this.ipAddress = props.ipAddress;
    this.userAgent = props.userAgent;
    this.createdAt = props.createdAt;
  }
}
