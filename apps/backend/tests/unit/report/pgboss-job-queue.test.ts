import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgBossJobQueue } from '../../../src/modules/report/infrastructure/pgboss-job-queue';

vi.mock('../../../src/shared/infrastructure/queue', () => ({
  sendJob: vi.fn().mockResolvedValue('job-id-123'),
}));

import { sendJob } from '../../../src/shared/infrastructure/queue';

const mockSendJob = vi.mocked(sendJob);

describe('PgBossJobQueue', () => {
  let queue: PgBossJobQueue;

  beforeEach(() => {
    vi.clearAllMocks();
    queue = new PgBossJobQueue();
  });

  it('calls sendJob with correct name and payload', async () => {
    const payload = { reportId: 'abc-123', tenantId: 'tenant-1' };

    await queue.enqueue('report.generate', payload);

    expect(mockSendJob).toHaveBeenCalledOnce();
    expect(mockSendJob).toHaveBeenCalledWith('report.generate', payload, undefined);
  });

  it('maps all options correctly (retryLimit, retryBackoff, retentionHours -> expireInHours)', async () => {
    const payload = { reportId: 'abc-123' };
    const options = { retryLimit: 3, retryBackoff: true, retentionHours: 48 };

    await queue.enqueue('report.generate', payload, options);

    expect(mockSendJob).toHaveBeenCalledWith('report.generate', payload, {
      retryLimit: 3,
      retryBackoff: true,
      expireInHours: 48,
    });
  });

  it('works with no options', async () => {
    await queue.enqueue('report.generate', { id: '1' });

    expect(mockSendJob).toHaveBeenCalledWith('report.generate', { id: '1' }, undefined);
  });

  it('works with partial options (retryLimit only)', async () => {
    await queue.enqueue('report.generate', { id: '1' }, { retryLimit: 5 });

    expect(mockSendJob).toHaveBeenCalledWith('report.generate', { id: '1' }, {
      retryLimit: 5,
      retryBackoff: undefined,
      expireInHours: undefined,
    });
  });

  it('works with partial options (retentionHours only)', async () => {
    await queue.enqueue('report.generate', { id: '1' }, { retentionHours: 24 });

    expect(mockSendJob).toHaveBeenCalledWith('report.generate', { id: '1' }, {
      retryLimit: undefined,
      retryBackoff: undefined,
      expireInHours: 24,
    });
  });
});
