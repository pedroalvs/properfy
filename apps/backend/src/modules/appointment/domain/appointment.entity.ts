import { BaseEntity } from '../../../shared/domain/entity';
import type { AppointmentStatus, TenantConfirmationStatus } from '@properfy/shared';
import { TRANSITION_RULES } from './appointment-state-machine';

export interface AppointmentProps {
  id: string;
  tenantId: string;
  branchId: string;
  propertyId: string;
  serviceTypeId: string;
  inspectorId: string | null;
  status: AppointmentStatus;
  scheduledDate: Date;
  timeSlot: string;
  keyRequired: boolean;
  meetingLocation: string | null;
  keyLocation: string | null;
  tenantConfirmationStatus: TenantConfirmationStatus;
  priceAmount: number;
  payoutAmount: number;
  pricingRuleSnapshotJson: Record<string, unknown>;
  notes: string | null;
  customFieldsJson: Record<string, unknown> | null;
  reason: string | null;
  createdByUserId: string;
  doneCheckedByUserId: string | null;
  doneCheckedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export class AppointmentEntity extends BaseEntity {
  readonly tenantId: string;
  readonly branchId: string;
  readonly propertyId: string;
  readonly serviceTypeId: string;
  inspectorId: string | null;
  status: AppointmentStatus;
  readonly scheduledDate: Date;
  readonly timeSlot: string;
  readonly keyRequired: boolean;
  readonly meetingLocation: string | null;
  readonly keyLocation: string | null;
  tenantConfirmationStatus: TenantConfirmationStatus;
  readonly priceAmount: number;
  readonly payoutAmount: number;
  readonly pricingRuleSnapshotJson: Record<string, unknown>;
  readonly notes: string | null;
  readonly customFieldsJson: Record<string, unknown> | null;
  reason: string | null;
  readonly createdByUserId: string;
  doneCheckedByUserId: string | null;
  doneCheckedAt: Date | null;
  deletedAt: Date | null;

  constructor(props: AppointmentProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.tenantId = props.tenantId;
    this.branchId = props.branchId;
    this.propertyId = props.propertyId;
    this.serviceTypeId = props.serviceTypeId;
    this.inspectorId = props.inspectorId;
    this.status = props.status;
    this.scheduledDate = props.scheduledDate;
    this.timeSlot = props.timeSlot;
    this.keyRequired = props.keyRequired;
    this.meetingLocation = props.meetingLocation;
    this.keyLocation = props.keyLocation;
    this.tenantConfirmationStatus = props.tenantConfirmationStatus;
    this.priceAmount = props.priceAmount;
    this.payoutAmount = props.payoutAmount;
    this.pricingRuleSnapshotJson = props.pricingRuleSnapshotJson;
    this.notes = props.notes;
    this.customFieldsJson = props.customFieldsJson;
    this.reason = props.reason;
    this.createdByUserId = props.createdByUserId;
    this.doneCheckedByUserId = props.doneCheckedByUserId;
    this.doneCheckedAt = props.doneCheckedAt;
    this.deletedAt = props.deletedAt;
  }

  isEditable(): boolean {
    return this.status === 'DRAFT' || this.status === 'AWAITING_INSPECTOR';
  }

  isActive(): boolean {
    return this.deletedAt === null;
  }

  isDeleted(): boolean {
    return this.deletedAt !== null;
  }

  canTransitionTo(target: AppointmentStatus): boolean {
    return TRANSITION_RULES.some((r) => r.from === this.status && r.to === target);
  }
}
