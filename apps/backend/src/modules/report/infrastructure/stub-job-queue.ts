import type { IJobQueue, JobOptions } from '../domain/job-queue';

export class StubJobQueue implements IJobQueue {
  async enqueue(_jobName: string, _payload: Record<string, unknown>, _options?: JobOptions): Promise<void> {
    // no-op stub — pg-boss not wired yet
  }
}
