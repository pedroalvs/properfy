import { BaseEntity } from '../../../shared/domain/entity';
import type { NotificationChannel, NotificationClass, ConsentChangeSource } from '@properfy/shared';

export interface NotificationConsentProps {
  id: string;
  recipient: string;
  channel: NotificationChannel;
  tenantId: string;
  notificationClass: NotificationClass;
  optedOut: boolean;
  optedOutAt: Date | null;
  changeSource: ConsentChangeSource | null;
  changedAt: Date | null;
  changedByUserId: string | null;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class NotificationConsentEntity extends BaseEntity {
  readonly recipient: string;
  readonly channel: NotificationChannel;
  readonly tenantId: string;
  readonly notificationClass: NotificationClass;
  optedOut: boolean;
  optedOutAt: Date | null;
  changeSource: ConsentChangeSource | null;
  changedAt: Date | null;
  changedByUserId: string | null;
  reason: string | null;

  constructor(props: NotificationConsentProps) {
    super(props.id, props.createdAt, props.updatedAt);
    this.recipient = props.recipient;
    this.channel = props.channel;
    this.tenantId = props.tenantId;
    this.notificationClass = props.notificationClass;
    this.optedOut = props.optedOut;
    this.optedOutAt = props.optedOutAt;
    this.changeSource = props.changeSource;
    this.changedAt = props.changedAt;
    this.changedByUserId = props.changedByUserId;
    this.reason = props.reason;
  }

  isOptedOut(): boolean {
    return this.optedOut;
  }

  /**
   * Flip the consent to opted-out and record the audit trail (feature 018).
   * `source` is mandatory so downstream queries can attribute the change.
   */
  markOptedOut(source: ConsentChangeSource, changedByUserId: string | null = null, reason: string | null = null): void {
    const now = new Date();
    this.optedOut = true;
    this.optedOutAt = now;
    this.changedAt = now;
    this.changeSource = source;
    this.changedByUserId = changedByUserId;
    this.reason = reason;
    this.updatedAt = now;
  }

  /**
   * Flip the consent back to opted-in and record the audit trail.
   * Used by operator override and re-opt-in flows.
   */
  markOptedIn(source: ConsentChangeSource, changedByUserId: string | null = null, reason: string | null = null): void {
    const now = new Date();
    this.optedOut = false;
    this.optedOutAt = null;
    this.changedAt = now;
    this.changeSource = source;
    this.changedByUserId = changedByUserId;
    this.reason = reason;
    this.updatedAt = now;
  }
}
