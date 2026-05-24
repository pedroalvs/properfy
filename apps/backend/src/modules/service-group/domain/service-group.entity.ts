import { BaseEntity } from '../../../shared/domain/entity';
import type { ServiceGroupStatus, PriorityMode, ServiceGroupExceptionType } from '@properfy/shared';

export interface ServiceGroupProps {
  id: string;
  tenantId: string;
  serviceTypeId: string;
  status: ServiceGroupStatus;
  groupSize: number;
  offeredCount: number;
  confirmedCount: number;
  scheduledDate: Date;
  timeWindow: string;
  name: string | null;
  regionName: string | null;
  description: string | null;
  priorityMode: PriorityMode;
  priorityExpiresAt: Date | null;
  exceptionType: ServiceGroupExceptionType | null;
  exceptionReason: string | null;
  assignedInspectorId: string | null;
  serviceRegionId: string | null;
  publishedAt: Date | null;
  assignedAt: Date | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export class ServiceGroupEntity extends BaseEntity {
  readonly tenantId: string;
  readonly serviceTypeId: string;
  status: ServiceGroupStatus;
  readonly groupSize: number;
  offeredCount: number;
  confirmedCount: number;
  readonly scheduledDate: Date;
  readonly timeWindow: string;
  name: string | null;
  regionName: string | null;
  description: string | null;
  readonly priorityMode: PriorityMode;
  priorityExpiresAt: Date | null;
  readonly exceptionType: ServiceGroupExceptionType | null;
  readonly exceptionReason: string | null;
  assignedInspectorId: string | null;
  serviceRegionId: string | null;
  publishedAt: Date | null;
  assignedAt: Date | null;
  readonly createdByUserId: string;

  constructor(props: ServiceGroupProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.tenantId = props.tenantId;
    this.serviceTypeId = props.serviceTypeId;
    this.status = props.status;
    this.groupSize = props.groupSize;
    this.offeredCount = props.offeredCount;
    this.confirmedCount = props.confirmedCount;
    this.scheduledDate = props.scheduledDate;
    this.timeWindow = props.timeWindow;
    this.name = props.name ?? null;
    this.regionName = props.regionName ?? null;
    this.description = props.description ?? null;
    this.priorityMode = props.priorityMode;
    this.priorityExpiresAt = props.priorityExpiresAt;
    this.exceptionType = props.exceptionType ?? null;
    this.exceptionReason = props.exceptionReason ?? null;
    this.assignedInspectorId = props.assignedInspectorId;
    this.serviceRegionId = props.serviceRegionId;
    this.publishedAt = props.publishedAt;
    this.assignedAt = props.assignedAt;
    this.createdByUserId = props.createdByUserId;
  }

  canPublish(): boolean {
    return this.status === 'DRAFT';
  }

  canAssign(): boolean {
    return this.status === 'DRAFT' || this.status === 'PUBLISHED';
  }

  canAccept(): boolean {
    return this.status === 'PUBLISHED';
  }

  canCancel(): boolean {
    return this.status === 'DRAFT' || this.status === 'PUBLISHED' || this.status === 'ACCEPTED';
  }

  canReject(): boolean {
    return this.status === 'PUBLISHED' || this.status === 'ACCEPTED';
  }

  canBeRepublished(): boolean {
    return this.status === 'CANCELLED';
  }

  isPriorityExpired(now: Date = new Date()): boolean {
    if (this.priorityMode !== 'PRIORITY_24H' || !this.priorityExpiresAt) {
      return false;
    }
    return this.priorityExpiresAt <= now;
  }
}
