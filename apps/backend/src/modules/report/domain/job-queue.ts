export interface JobOptions {
  retryLimit?: number;
  retryBackoff?: boolean;
  retentionHours?: number;
}

export interface IJobQueue {
  enqueue(jobName: string, payload: Record<string, unknown>, options?: JobOptions): Promise<void>;
}
