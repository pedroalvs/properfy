import type { IJobQueue, JobOptions } from '../domain/job-queue';
import { sendJob } from './queue';

export class PgBossJobQueue implements IJobQueue {
  async enqueue(jobName: string, payload: Record<string, unknown>, options?: JobOptions): Promise<void> {
    // pg-boss validates send options with `'key' in options` assertions, so a
    // key present with an `undefined` value crashes send() — only forward keys
    // the caller actually set.
    const jobId = await sendJob(jobName, payload, options ? {
      ...(options.retryLimit !== undefined && { retryLimit: options.retryLimit }),
      ...(options.retryBackoff !== undefined && { retryBackoff: options.retryBackoff }),
      ...(options.retentionHours !== undefined && { expireInHours: options.retentionHours }),
      ...(options.singletonKey !== undefined && { singletonKey: options.singletonKey }),
      ...(options.expireInMinutes !== undefined && { expireInMinutes: options.expireInMinutes }),
      ...(options.startAfter !== undefined && { startAfter: options.startAfter }),
    } : undefined);

    // pg-boss returns null instead of a job id when a singletonKey collides
    // with an already-active job — the send is a deliberate no-op, not a
    // failure, but it should still be visible (e.g. a concurrent commit
    // request that got deduped rather than actually enqueued).
    if (jobId === null && options?.singletonKey) {
      // eslint-disable-next-line no-console -- no logger is injected into this class; matches assertQueueDbConsistency's fallback above
      console.warn(JSON.stringify({ event: 'queue.singleton_key_collision', jobName, singletonKey: options.singletonKey }));
    }
  }
}
