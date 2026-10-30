import { describe, expect, it, vi } from 'vitest';
import { AutoArchiveInspectorNoticesUseCase } from '../../../src/modules/inspector-notice/application/use-cases/auto-archive-inspector-notices.use-case';

const NOW = new Date('2026-12-15T03:45:00Z');
const DAY = 24 * 60 * 60 * 1000;

function build(retentionDays = 30, archived = 3, purged = 1) {
  const noticeRepo = { autoArchiveSystemOlderThan: vi.fn(async () => archived) } as any;
  const pushSubRepo = { purgeRevokedBefore: vi.fn(async () => purged) } as any;
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const useCase = new AutoArchiveInspectorNoticesUseCase(noticeRepo, pushSubRepo, { now: () => NOW }, retentionDays, logger as any);
  return { useCase, noticeRepo, pushSubRepo, logger };
}

describe('AutoArchiveInspectorNoticesUseCase', () => {
  it('archives system notices older than the retention window and logs the count', async () => {
    const { useCase, noticeRepo, logger } = build(30, 3);
    await useCase.execute();
    const [cutoff, now, batch] = noticeRepo.autoArchiveSystemOlderThan.mock.calls[0];
    expect(cutoff.getTime()).toBe(NOW.getTime() - 30 * DAY);
    expect(now).toEqual(NOW);
    expect(batch).toBe(1000);
    expect(logger.info.mock.calls.find((c) => c[1] === 'inspector_notice.auto_archived')?.[0]).toEqual({ count: 3 });
  });

  it('honours a custom retention window', async () => {
    const { useCase, noticeRepo } = build(7);
    await useCase.execute();
    expect(noticeRepo.autoArchiveSystemOlderThan.mock.calls[0][0].getTime()).toBe(NOW.getTime() - 7 * DAY);
  });

  it('purges subscriptions revoked more than 90 days ago and logs the count', async () => {
    const { useCase, pushSubRepo, logger } = build(30, 3, 5);
    await useCase.execute();
    expect(pushSubRepo.purgeRevokedBefore.mock.calls[0][0].getTime()).toBe(NOW.getTime() - 90 * DAY);
    expect(pushSubRepo.purgeRevokedBefore.mock.calls[0][1]).toBe(1000);
    expect(logger.info.mock.calls.find((c) => c[1] === 'push_subscription.purged')?.[0]).toEqual({ count: 5 });
  });
});
