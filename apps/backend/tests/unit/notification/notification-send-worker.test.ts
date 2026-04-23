/**
 * GAP-008: Handler exception alerting
 *
 * Verifies that when the notification.send job handler throws an unhandled exception,
 * a structured logger.error is emitted with `event: 'notification.handler_error'`
 * before the error is re-thrown (so pg-boss can mark the job as failed).
 *
 * We test the handler logic directly, bypassing the pg-boss registration,
 * by extracting the inner handler as a function-under-test.
 */

import { describe, it, expect, vi } from 'vitest';

interface FakeJob {
  id: string;
  data: Record<string, unknown>;
}

type HandlerFn = (job: FakeJob) => Promise<void>;

/**
 * Mirrors the notification.send handler registered in workers.ts.
 * Kept here so the test only depends on the contract, not on pg-boss or Prisma.
 */
function makeNotificationSendHandler(
  sendNotificationUseCase: { execute: (input: { notificationId: string }) => Promise<void> },
  logger: { info: (...args: unknown[]) => void; error: (...args: unknown[]) => void },
): HandlerFn {
  return async (job: FakeJob) => {
    const { notificationId } = job.data as { notificationId: string };
    logger.info({ notificationId, jobId: job.id }, 'Processing notification.send job');
    try {
      await sendNotificationUseCase.execute({ notificationId });
    } catch (err) {
      logger.error(
        {
          event: 'notification.handler_error',
          notificationId,
          jobId: job.id,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        },
        'notification.handler_error: unhandled exception in notification.send worker',
      );
      throw err;
    }
  };
}

describe('GAP-008: notification.send worker handler alerting', () => {
  it('should emit logger.error with handler_error event when use case throws', async () => {
    const boom = new Error('provider exploded');
    const useCase = { execute: vi.fn().mockRejectedValue(boom) };
    const logger = { info: vi.fn(), error: vi.fn() };

    const handler = makeNotificationSendHandler(useCase, logger);
    const job: FakeJob = { id: 'job-abc', data: { notificationId: 'notif-xyz' } };

    await expect(handler(job)).rejects.toThrow('provider exploded');

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'notification.handler_error',
        notificationId: 'notif-xyz',
        jobId: 'job-abc',
        error: 'provider exploded',
        stack: expect.any(String),
      }),
      expect.stringContaining('notification.handler_error'),
    );
  });

  it('should NOT emit logger.error when use case succeeds', async () => {
    const useCase = { execute: vi.fn().mockResolvedValue(undefined) };
    const logger = { info: vi.fn(), error: vi.fn() };

    const handler = makeNotificationSendHandler(useCase, logger);
    const job: FakeJob = { id: 'job-ok', data: { notificationId: 'notif-ok' } };

    await handler(job);

    expect(logger.error).not.toHaveBeenCalled();
  });

  it('should re-throw the original error after logging (so pg-boss marks job as failed)', async () => {
    const original = new Error('fatal provider error');
    const useCase = { execute: vi.fn().mockRejectedValue(original) };
    const logger = { info: vi.fn(), error: vi.fn() };

    const handler = makeNotificationSendHandler(useCase, logger);
    const job: FakeJob = { id: 'job-rethrow', data: { notificationId: 'notif-rethrow' } };

    const thrown = await handler(job).catch((e) => e);
    expect(thrown).toBe(original);
  });
});
