import type { NotificationAttemptStatus } from '@properfy/shared';

export interface NotificationAttemptProps {
  id: string;
  notificationId: string;
  attemptNumber: number;
  status: NotificationAttemptStatus;
  providerError: string | null;
  startedAt: Date;
  finishedAt: Date | null;
}

export class NotificationAttemptEntity {
  readonly id: string;
  readonly notificationId: string;
  readonly attemptNumber: number;
  status: NotificationAttemptStatus;
  providerError: string | null;
  readonly startedAt: Date;
  finishedAt: Date | null;

  constructor(props: NotificationAttemptProps) {
    this.id = props.id;
    this.notificationId = props.notificationId;
    this.attemptNumber = props.attemptNumber;
    this.status = props.status;
    this.providerError = props.providerError;
    this.startedAt = props.startedAt;
    this.finishedAt = props.finishedAt;
  }

  markSuccess(): void {
    this.status = 'SUCCESS';
    this.finishedAt = new Date();
  }

  markFailed(error: string): void {
    this.status = 'FAILED';
    this.providerError = error;
    this.finishedAt = new Date();
  }
}
