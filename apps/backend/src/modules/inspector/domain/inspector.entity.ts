import { BaseEntity } from '../../../shared/domain/entity';
import type {
  InspectorStatus,
  PaymentSettings,
  ServiceTypeEntry,
  ClientEligibilityEntry,
} from '@properfy/shared';

export interface InspectorProps {
  id: string;
  userId: string | null;
  name: string;
  email: string;
  phone: string | null;
  status: InspectorStatus;
  paymentSettingsJson: PaymentSettings;
  serviceTypesJson: ServiceTypeEntry[];
  clientEligibilityJson: ClientEligibilityEntry[];
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class InspectorEntity extends BaseEntity {
  readonly userId: string | null;
  readonly name: string;
  readonly email: string;
  readonly phone: string | null;
  status: InspectorStatus;
  readonly paymentSettingsJson: PaymentSettings;
  readonly serviceTypesJson: ServiceTypeEntry[];
  readonly clientEligibilityJson: ClientEligibilityEntry[];
  readonly deletedAt: Date | null;

  constructor(props: InspectorProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.userId = props.userId;
    this.name = props.name;
    this.email = props.email;
    this.phone = props.phone;
    this.status = props.status;
    this.paymentSettingsJson = props.paymentSettingsJson;
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
    return this.clientEligibilityJson.some(
      (entry) => entry.tenantId === tenantId && entry.eligible,
    );
  }

  supportsServiceType(serviceTypeId: string): boolean {
    return this.serviceTypesJson.some(
      (entry) => entry.serviceTypeId === serviceTypeId,
    );
  }

  isCertifiedForServiceType(serviceTypeId: string): boolean {
    return this.serviceTypesJson.some(
      (entry) => entry.serviceTypeId === serviceTypeId && entry.certified,
    );
  }
}
