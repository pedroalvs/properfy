import { BaseEntity } from '../../../shared/domain/entity';
import type {
  InspectorStatus,
  PaymentSettings,
  ServiceTypeEntry,
  ClientEligibilityEntry,
  AvailabilityTemplate,
} from '@properfy/shared';
import { availabilityTemplateSchema } from '@properfy/shared';

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
  insuranceMetaJson: Record<string, unknown> | null;
  policeCheckFileKey: string | null;
  policeCheckExpiresAt: Date | null;
  policeCheckMetaJson: Record<string, unknown> | null;
  photoStorageKey: string | null;
  availabilityTemplateJson: Record<string, unknown>;
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
  readonly insuranceMetaJson: Record<string, unknown> | null;
  readonly policeCheckFileKey: string | null;
  readonly policeCheckExpiresAt: Date | null;
  readonly policeCheckMetaJson: Record<string, unknown> | null;
  readonly photoStorageKey: string | null;
  readonly availabilityTemplateJson: Record<string, unknown>;
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
    this.insuranceMetaJson = props.insuranceMetaJson;
    this.policeCheckFileKey = props.policeCheckFileKey;
    this.policeCheckExpiresAt = props.policeCheckExpiresAt;
    this.policeCheckMetaJson = props.policeCheckMetaJson;
    this.photoStorageKey = props.photoStorageKey;
    this.availabilityTemplateJson = props.availabilityTemplateJson;
    this.deletedAt = props.deletedAt;
  }

  /** Returns the weekly availability template, defaulting all-false when the JSON is empty. */
  get availabilityTemplate(): AvailabilityTemplate {
    const parsed = availabilityTemplateSchema.safeParse(this.availabilityTemplateJson);
    if (parsed.success) return parsed.data;
    const off = { am: false, pm: false };
    return { mon: off, tue: off, wed: off, thu: off, fri: off, sat: off, sun: off };
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
