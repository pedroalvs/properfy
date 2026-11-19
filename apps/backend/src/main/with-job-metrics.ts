import { metrics } from '../shared/infrastructure/metrics';
import { runWithRequestContext } from '../shared/infrastructure/request-context';

/**
 * Wrap a pg-boss handler so each run propagates a request id and records a
 * success/failure job metric with its duration. Shared by `registerWorkers`
 * and the per-queue worker modules (e.g. day-plan.publish) so the two cannot
 * drift and no circular import between them is needed.
 */
export function withJobMetrics<T extends { id: string; data: Record<string, unknown> }>(
  queue: string,
  handler: (job: T) => Promise<void>,
): (job: T) => Promise<void> {
  return async (job: T) => {
    const requestId = (job.data?._requestId as string | undefined) ?? crypto.randomUUID();
    const start = performance.now();
    await runWithRequestContext({ requestId }, async () => {
      try {
        await handler(job);
        metrics.jobExecuted(queue, 'success', performance.now() - start);
      } catch (err) {
        metrics.jobExecuted(queue, 'failure', performance.now() - start);
        throw err;
      }
    });
  };
}
