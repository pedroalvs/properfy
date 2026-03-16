import { BaseEntity } from '../../../shared/domain/entity';
import type { InspectorStatus } from '@properfy/shared';

export interface InspectorProps {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  status: InspectorStatus;
  paymentSettingsJson: Record<string, unknown>;
  regionsJson: string[];
  serviceTypesJson: string[];
  clientEligibilityJson: string[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class InspectorEntity extends BaseEntity {
  readonly name: string;
  readonly email: string;
  readonly phone: string | null;
  status: InspectorStatus;
  readonly paymentSettingsJson: Record<string, unknown>;
  readonly regionsJson: string[];
  readonly serviceTypesJson: string[];
  readonly clientEligibilityJson: string[];
  readonly deletedAt: Date | null;

  constructor(props: InspectorProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.name = props.name;
    this.email = props.email;
    this.phone = props.phone;
    this.status = props.status;
    this.paymentSettingsJson = props.paymentSettingsJson;
    this.regionsJson = props.regionsJson;
    this.serviceTypesJson = props.serviceTypesJson;
    this.clientEligibilityJson = props.clientEligibilityJson;
    this.deletedAt = props.deletedAt;
  }

  isActive(): boolean {
    return this.status === 'ACTIVE' && this.deletedAt === null;
  }

  isDeleted(): boolean {
    return this.deletedAt !== null;
  }

  isEligibleForTenant(tenantId: string): boolean {
    return this.clientEligibilityJson.includes(tenantId);
  }

  supportsServiceType(serviceTypeId: string): boolean {
    return this.serviceTypesJson.includes(serviceTypeId);
  }
}
