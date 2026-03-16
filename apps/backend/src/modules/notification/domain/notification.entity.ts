import { BaseEntity } from '../../../shared/domain/entity';
import type { NotificationChannel, NotificationStatus } from '@properfy/shared';

export interface NotificationProps {
  id: string;
  tenantId: string;
  appointmentId: string | null;
  recipient: string;
  channel: NotificationChannel;
  templateCode: string;
  status: NotificationStatus;
  providerName: string | null;
  providerMessageId: string | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  failedAt: Date | null;
  failureReason: string | null;
  payloadJson: Record<string, string>;
  retryCount: number;
  nextRetryAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class NotificationEntity extends BaseEntity {
  readonly tenantId: string;
  readonly appointmentId: string | null;
  readonly recipient: string;
  readonly channel: NotificationChannel;
  readonly templateCode: string;
  status: NotificationStatus;
  providerName: string | null;
  providerMessageId: string | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  failedAt: Date | null;
  failureReason: string | null;
  readonly payloadJson: Record<string, string>;
  retryCount: number;
  nextRetryAt: Date | null;

  constructor(props: NotificationProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.tenantId = props.tenantId;
    this.appointmentId = props.appointmentId;
    this.recipient = props.recipient;
    this.channel = props.channel;
    this.templateCode = props.templateCode;
    this.status = props.status;
    this.providerName = props.providerName;
    this.providerMessageId = props.providerMessageId;
    this.sentAt = props.sentAt;
    this.deliveredAt = props.deliveredAt;
    this.failedAt = props.failedAt;
    this.failureReason = props.failureReason;
    this.payloadJson = props.payloadJson;
    this.retryCount = props.retryCount;
    this.nextRetryAt = props.nextRetryAt;
  }

  isPending(): boolean {
    return this.status === 'PENDING';
  }

  isFailed(): boolean {
    return this.status === 'FAILED';
  }

  isSent(): boolean {
    return this.status === 'SENT';
  }

  isDelivered(): boolean {
    return this.status === 'DELIVERED';
  }

  canBeRetried(): boolean {
    return this.status === 'FAILED';
  }

  canBeSent(): boolean {
    return this.status === 'PENDING';
  }
}
