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
  /** @deprecated Use blockedClientsJson instead */
  clientEligibilityJson: ClientEligibilityEntry[];
  // Feedback Round item 1: blocked-clients model
  blockedClientsJson: string[];
  // Feedback Round item 6: profile extension
  fullName: string | null;
  address: Record<string, unknown> | null;
  abn: string | null;
  dateOfBirth: Date | null;
  insuranceFileKey: string | null;
  insuranceExpiresAt: Date | null;
  policeCheckFileKey: string | null;
  policeCheckExpiresAt: Date | null;
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
  /** @deprecated Use blockedClientsJson instead */
  readonly clientEligibilityJson: ClientEligibilityEntry[];
  readonly blockedClientsJson: string[];
  readonly fullName: string | null;
  readonly address: Record<string, unknown> | null;
  readonly abn: string | null;
  readonly dateOfBirth: Date | null;
  readonly insuranceFileKey: string | null;
  readonly insuranceExpiresAt: Date | null;
  readonly policeCheckFileKey: string | null;
  readonly policeCheckExpiresAt: Date | null;
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
    this.blockedClientsJson = props.blockedClientsJson;
    this.fullName = props.fullName;
    this.address = props.address;
    this.abn = props.abn;
    this.dateOfBirth = props.dateOfBirth;
    this.insuranceFileKey = props.insuranceFileKey;
    this.insuranceExpiresAt = props.insuranceExpiresAt;
    this.policeCheckFileKey = props.policeCheckFileKey;
    this.policeCheckExpiresAt = props.policeCheckExpiresAt;
    this.deletedAt = props.deletedAt;
  }

  isActive(): boolean {
    return this.status === 'ACTIVE' && this.deletedAt === null;
  }

  isDeleted(): boolean {
    return this.deletedAt !== null;
  }

  /** Check if inspector is blocked from a specific tenant */
  isBlockedForTenant(tenantId: string): boolean {
    return this.blockedClientsJson.includes(tenantId);
  }

  /**
   * Check if inspector is eligible for a specific tenant.
   * Rewritten to use blocked-clients model (Feedback Round item 1).
   * An inspector is eligible when NOT blocked.
   */
  isEligibleForTenant(tenantId: string): boolean {
    return !this.isBlockedForTenant(tenantId);
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
