import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgBossJobQueue } from '../../../src/shared/infrastructure/pgboss-job-queue';
import { sendJob } from '../../../src/shared/infrastructure/queue';
// pg-boss validates send options with `'key' in options` assertions, so a key
// present with an `undefined` value crashes send(). We validate against the
// real attorney to prove the mapped options survive pg-boss validation.
// eslint-disable-next-line @typescript-eslint/no-require-imports
import attorney from 'pg-boss/src/attorney.js';

vi.mock('../../../src/shared/infrastructure/queue', () => ({
  sendJob: vi.fn().mockResolvedValue('job-id'),
}));

const sendJobMock = vi.mocked(sendJob);

/** Options pg-boss applies as defaults when validating send args (subset relevant to asserts). */
const PG_BOSS_DEFAUTS = { archiveSeconds: 43_200 };

describe('PgBossJobQueue', () => {
  beforeEach(() => {
    sendJobMock.mockClear();
  });

  it('omits option keys the caller did not set (pg-boss asserts on present-but-undefined keys)', async () => {
    const queue = new PgBossJobQueue();

    // Exactly the options CreateNotificationUseCase sends for notification.send.
    await queue.enqueue('notification.send', { notificationId: 'n-1' }, {
      retryLimit: 0,
      singletonKey: 'n-1',
      expireInMinutes: 5,
    });

    expect(sendJobMock).toHaveBeenCalledTimes(1);
    const passedOptions = sendJobMock.mock.calls[0]![2] as Record<string, unknown>;
    for (const [key, value] of Object.entries(passedOptions)) {
      expect(value, `option "${key}" must not be passed as undefined`).not.toBeUndefined();
    }
  });

  it('mapped options pass pg-boss checkSendArgs validation (prod ERR_ASSERTION regression)', async () => {
    const queue = new PgBossJobQueue();
    await queue.enqueue('notification.send', { notificationId: 'n-1' }, {
      retryLimit: 0,
      singletonKey: 'n-1',
      expireInMinutes: 5,
    });

    const passedOptions = sendJobMock.mock.calls[0]![2] as Record<string, unknown>;
    expect(() =>
      attorney.checkSendArgs(['notification.send', { notificationId: 'n-1' }, passedOptions], PG_BOSS_DEFAUTS),
    ).not.toThrow();
  });

  it('still forwards every option the caller actually set', async () => {
    const queue = new PgBossJobQueue();
    const startAfter = new Date('2026-06-09T00:00:00Z');
    await queue.enqueue('jobs.full', { a: 1 }, {
      retryLimit: 3,
      retryBackoff: true,
      retentionHours: 48,
      singletonKey: 'k-1',
      expireInMinutes: 10,
      startAfter,
    });

    expect(sendJobMock.mock.calls[0]![2]).toEqual({
      retryLimit: 3,
      retryBackoff: true,
      expireInHours: 48,
      singletonKey: 'k-1',
      expireInMinutes: 10,
      startAfter,
    });
  });

  it('passes no options object at all when the caller gave none', async () => {
    const queue = new PgBossJobQueue();
    await queue.enqueue('jobs.bare', { a: 1 });
    expect(sendJobMock.mock.calls[0]![2]).toBeUndefined();
  });

  it('warns when a singletonKey collision silently drops the enqueue (sendJob returns null)', async () => {
    sendJobMock.mockResolvedValueOnce(null);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const queue = new PgBossJobQueue();

    await queue.enqueue('appointment.import.commit', { importId: 'import-1' }, { singletonKey: 'import-1' });

    expect(warnSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(warnSpy.mock.calls[0]![0] as string);
    expect(logged).toEqual({ event: 'queue.singleton_key_collision', jobName: 'appointment.import.commit', singletonKey: 'import-1' });
    warnSpy.mockRestore();
  });

  it('does not warn when the enqueue succeeds normally', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const queue = new PgBossJobQueue();

    await queue.enqueue('appointment.import.commit', { importId: 'import-1' }, { singletonKey: 'import-1' });

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
