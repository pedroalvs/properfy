import type { IJobQueue, JobOptions } from '../domain/job-queue';
import { sendJob } from './queue';

export class PgBossJobQueue implements IJobQueue {
  async enqueue(jobName: string, payload: Record<string, unknown>, options?: JobOptions): Promise<void> {
    await sendJob(jobName, payload, options ? {
      retryLimit: options.retryLimit,
      retryBackoff: options.retryBackoff,
      expireInHours: options.retentionHours,
      singletonKey: options.singletonKey,
      expireInMinutes: options.expireInMinutes,
      startAfter: options.startAfter,
    } : undefined);
  }
}
