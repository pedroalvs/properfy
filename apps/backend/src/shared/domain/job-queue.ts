export interface JobOptions {
  retryLimit?: number;
  retryBackoff?: boolean;
  retentionHours?: number;
  /** Idempotency key — only one job with this key will be queued at a time. */
  singletonKey?: string;
  /** Job expiry / visibility timeout in minutes. */
  expireInMinutes?: number;
  /** Delay job start until this date (ISO-8601 string or Date). */
  startAfter?: Date | string;
}

export interface IJobQueue {
  enqueue(jobName: string, payload: Record<string, unknown>, options?: JobOptions): Promise<void>;
}
