import type { ContactType } from '@properfy/shared';

export interface AdditionalChannel {
  channel: 'EMAIL' | 'PHONE';
  value: string;
  label?: string;
}

export interface ContactProps {
  id: string;
  /**
   * 024 §FR-301 — nullable. Standalone contacts (created by AM/OP without
   * an appointment context) carry `tenantId = null` until linked via
   * `appointment_contacts`.
   */
  tenantId: string | null;
  type: ContactType;
  displayName: string;
  company: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  additionalChannels: AdditionalChannel[];
  notes: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class ContactEntity {
  readonly id: string;
  readonly tenantId: string | null;
  readonly type: ContactType;
  readonly displayName: string;
  readonly company: string | null;
  readonly primaryEmail: string | null;
  readonly primaryPhone: string | null;
  readonly additionalChannels: AdditionalChannel[];
  readonly notes: string | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: ContactProps) {
    this.id = props.id;
    this.tenantId = props.tenantId;
    this.type = props.type;
    this.displayName = props.displayName;
    this.company = props.company;
    this.primaryEmail = props.primaryEmail;
    this.primaryPhone = props.primaryPhone;
    this.additionalChannels = props.additionalChannels;
    this.notes = props.notes;
    this.isActive = props.isActive;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }
}
