import { describe, it, expect, vi } from 'vitest';
import { CreateNotificationUseCase } from '../create-notification.use-case';

/**
 * Unit tests for CreateNotificationUseCase — enqueue instrumentation (T006)
 *
 * These tests assert the structured logging contract around the pg-boss enqueue call.
 * Per spec §3.B1 Step 2 and Regras invariant A.2: silent enqueue failure is FORBIDDEN.
 */

function makeLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn(),
  };
}

function makeNotificationRepo() {
  return { save: vi.fn().mockResolvedValue(undefined) };
}

function makeTemplateRepo() {
  return { findByTenantCodeChannel: vi.fn().mockResolvedValue(null) };
}

const VALID_INPUT = {
  tenantId: 'tenant-1',
  appointmentId: 'appt-1',
  recipient: 'tenant@example.com',
  channel: 'EMAIL' as const,
  templateCode: 'TENANT_PORTAL_LINK',
  payloadJson: { confirmationLink: 'http://x' },
};

describe('CreateNotificationUseCase — enqueue instrumentation', () => {
  it('should log notification.enqueue_start before calling jobQueue.enqueue', async () => {
    const logger = makeLogger();
    const jobQueue = { enqueue: vi.fn().mockResolvedValue(undefined) };
    const uc = new CreateNotificationUseCase(
      makeNotificationRepo() as any,
      makeTemplateRepo() as any,
      jobQueue as any,
      logger as any,
    );

    await uc.execute(VALID_INPUT);

    // The start log must have fired
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ notificationId: expect.any(String), jobName: 'notification.send' }),
      'notification.enqueue_start',
    );

    // The start log must have fired BEFORE enqueue
    const startCallOrder = logger.info.mock.invocationCallOrder.find((_, i) => {
      const [ctx, msg] = logger.info.mock.calls[i] as [any, string];
      return msg === 'notification.enqueue_start';
    });
    const enqueueCallOrder = jobQueue.enqueue.mock.invocationCallOrder[0];
    expect(startCallOrder).toBeDefined();
    expect(startCallOrder!).toBeLessThan(enqueueCallOrder!);
  });

  it('should log notification.enqueue_success after jobQueue.enqueue resolves', async () => {
    const logger = makeLogger();
    const jobQueue = { enqueue: vi.fn().mockResolvedValue(undefined) };
    const uc = new CreateNotificationUseCase(
      makeNotificationRepo() as any,
      makeTemplateRepo() as any,
      jobQueue as any,
      logger as any,
    );

    await uc.execute(VALID_INPUT);

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ notificationId: expect.any(String), jobName: 'notification.send' }),
      'notification.enqueue_success',
    );
  });

  it('should log notification.enqueue_failed and re-throw when jobQueue.enqueue rejects', async () => {
    const logger = makeLogger();
    const enqueueError = new Error('pg-boss connection failed');
    const jobQueue = { enqueue: vi.fn().mockRejectedValue(enqueueError) };
    const uc = new CreateNotificationUseCase(
      makeNotificationRepo() as any,
      makeTemplateRepo() as any,
      jobQueue as any,
      logger as any,
    );

    await expect(uc.execute(VALID_INPUT)).rejects.toThrow('pg-boss connection failed');
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ notificationId: expect.any(String), jobName: 'notification.send' }),
      'notification.enqueue_failed',
    );
  });

  it('should not swallow enqueue errors — re-throw is mandatory per Regras A.2', async () => {
    const logger = makeLogger();
    const jobQueue = { enqueue: vi.fn().mockRejectedValue(new Error('queue error')) };
    const uc = new CreateNotificationUseCase(
      makeNotificationRepo() as any,
      makeTemplateRepo() as any,
      jobQueue as any,
      logger as any,
    );

    // The error must propagate to the caller, not be swallowed
    await expect(uc.execute(VALID_INPUT)).rejects.toThrow('queue error');
  });
});
