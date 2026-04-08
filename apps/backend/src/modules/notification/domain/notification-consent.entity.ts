import { BaseEntity } from '../../../shared/domain/entity';
import type { NotificationChannel } from '@properfy/shared';

export interface NotificationConsentProps {
  id: string;
  recipient: string;
  channel: NotificationChannel;
  tenantId: string;
  optedOut: boolean;
  optedOutAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class NotificationConsentEntity extends BaseEntity {
  readonly recipient: string;
  readonly channel: NotificationChannel;
  readonly tenantId: string;
  optedOut: boolean;
  optedOutAt: Date | null;

  constructor(props: NotificationConsentProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.recipient = props.recipient;
    this.channel = props.channel;
    this.tenantId = props.tenantId;
    this.optedOut = props.optedOut;
    this.optedOutAt = props.optedOutAt;
  }

  isOptedOut(): boolean {
    return this.optedOut;
  }

  markOptedOut(): void {
    this.optedOut = true;
    this.optedOutAt = new Date();
    this.updatedAt = new Date();
  }
}
