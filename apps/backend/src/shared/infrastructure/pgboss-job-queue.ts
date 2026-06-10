import type { IJobQueue, JobOptions } from '../domain/job-queue';
import { sendJob } from './queue';

export class PgBossJobQueue implements IJobQueue {
  async enqueue(jobName: string, payload: Record<string, unknown>, options?: JobOptions): Promise<void> {
    // pg-boss validates send options with `'key' in options` assertions, so a
    // key present with an `undefined` value crashes send() — only forward keys
    // the caller actually set.
    await sendJob(jobName, payload, options ? {
      ...(options.retryLimit !== undefined && { retryLimit: options.retryLimit }),
      ...(options.retryBackoff !== undefined && { retryBackoff: options.retryBackoff }),
      ...(options.retentionHours !== undefined && { expireInHours: options.retentionHours }),
      ...(options.singletonKey !== undefined && { singletonKey: options.singletonKey }),
      ...(options.expireInMinutes !== undefined && { expireInMinutes: options.expireInMinutes }),
      ...(options.startAfter !== undefined && { startAfter: options.startAfter }),
    } : undefined);
  }
}
