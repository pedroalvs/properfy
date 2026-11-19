import { describe, expect, it, vi } from 'vitest';
import { SweepUndeliveredInspectorNoticesUseCase } from '../../../src/modules/inspector-notice/application/use-cases/sweep-undelivered-inspector-notices.use-case';

// Sydney is AEDT (UTC+11) in November.
const AT = (iso: string) => new Date(iso);

function build(rows: any[], now: Date) {
  const repo = { findUndeliveredForSweep: vi.fn(async () => rows) } as any;
  const jobQueue = { enqueue: vi.fn(async () => undefined) };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const useCase = new SweepUndeliveredInspectorNoticesUseCase(repo, jobQueue as any, { now: () => now }, logger as any);
  return { useCase, repo, jobQueue, logger };
}

describe('SweepUndeliveredInspectorNoticesUseCase', () => {
  it('re-enqueues eligible notices with the publish options and logs completion + requeued', async () => {
    const rows = [
      { id: 'n1', recipientCount: 2, reason: 'not_started', pendingCount: 2 },
      { id: 'n2', recipientCount: 500, reason: 'incomplete', pendingCount: 1 },
    ];
    const { useCase, jobQueue, logger } = build(rows, AT('2026-11-09T23:00:00Z')); // 10:00 Sydney
    await useCase.execute();
    expect(jobQueue.enqueue).toHaveBeenCalledTimes(2);
    expect(jobQueue.enqueue.mock.calls[0]).toEqual([
      'inspector-notice.deliver',
      { noticeId: 'n1' },
      { singletonKey: 'n1', retryLimit: 3, retryBackoff: true, expireInMinutes: 15 },
    ]);
    expect(jobQueue.enqueue.mock.calls[1][2].expireInMinutes).toBe(22);
    expect(logger.error.mock.calls.some((c) => c[1] === 'inspector_notice.delivery_incomplete')).toBe(true);
    expect(logger.info.mock.calls.some((c) => c[1] === 'inspector_notice.sweep_completed')).toBe(true);
    expect(logger.warn.mock.calls.some((c) => c[1] === 'inspector_notice.sweep_requeued')).toBe(true);
  });

  it('does not warn requeued when nothing is eligible', async () => {
    const { useCase, logger } = build([], AT('2026-11-09T23:00:00Z'));
    await useCase.execute();
    expect(logger.warn.mock.calls.some((c) => c[1] === 'inspector_notice.sweep_requeued')).toBe(false);
    expect(logger.info.mock.calls.some((c) => c[1] === 'inspector_notice.sweep_completed')).toBe(true);
  });

  it('skips entirely during quiet hours (midnight Sydney)', async () => {
    const { useCase, repo, jobQueue, logger } = build([{ id: 'n1', recipientCount: 1, reason: 'not_started', pendingCount: 1 }], AT('2026-11-10T13:00:00Z')); // 00:00 Sydney
    await useCase.execute();
    expect(repo.findUndeliveredForSweep).not.toHaveBeenCalled();
    expect(jobQueue.enqueue).not.toHaveBeenCalled();
    expect(logger.info.mock.calls.some((c) => c[1] === 'inspector_notice.sweep_skipped_quiet_hours')).toBe(true);
  });

  it.each([
    ['2026-11-10T10:59:00Z', 21, true], // 21:59 Sydney → run
    ['2026-11-10T11:00:00Z', 22, false], // 22:00 Sydney → skip
    ['2026-11-09T18:59:00Z', 5, false], // 05:59 Sydney → skip
    ['2026-11-09T19:00:00Z', 6, true], // 06:00 Sydney → run
  ])('boundary %s runs=%s', async (iso, _hour, runs) => {
    const { useCase, repo } = build([], AT(iso));
    await useCase.execute();
    expect(repo.findUndeliveredForSweep).toHaveBeenCalledTimes(runs ? 1 : 0);
  });
});
