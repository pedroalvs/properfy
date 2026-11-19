import { describe, expect, it, vi } from 'vitest';
import { GetInspectorNoticeUseCase } from '../../../src/modules/inspector-notice/application/use-cases/get-inspector-notice.use-case';

const NOW = new Date('2026-11-10T00:00:00Z');
const READ = new Date('2026-11-10T01:00:00Z');

describe('GetInspectorNoticeUseCase', () => {
  it('maps the detail with per-recipient status/app-access (L-F02-09)', async () => {
    const repo = {
      getDetail: vi.fn(async () => ({
        id: 'n1',
        title: 'T',
        body: 'B',
        critical: false,
        audience: { type: 'ALL' },
        authorUserId: 'u1',
        authorName: 'Ana Op',
        systemType: null,
        publishedAt: NOW,
        archivedAt: null,
        recipientCount: 2,
        readCount: 1,
        recipients: [
          { inspectorId: 'i1', inspectorName: 'Alice', readAt: READ, inspectorStatus: 'ACTIVE', hasAppAccess: true },
          { inspectorId: 'i2', inspectorName: 'Bob', readAt: null, inspectorStatus: 'INACTIVE', hasAppAccess: false },
        ],
      })),
    } as any;
    const useCase = new GetInspectorNoticeUseCase(repo);

    const detail = await useCase.execute('n1');

    expect(detail.recipients).toHaveLength(2);
    expect(detail.recipients[0]).toEqual({ inspectorId: 'i1', inspectorName: 'Alice', readAt: READ.toISOString(), inspectorStatus: 'ACTIVE', hasAppAccess: true });
    expect(detail.recipients[1]).toMatchObject({ readAt: null, inspectorStatus: 'INACTIVE', hasAppAccess: false });
  });

  it('throws 404 when the notice is missing', async () => {
    const repo = { getDetail: vi.fn(async () => null) } as any;
    await expect(new GetInspectorNoticeUseCase(repo).execute('nope')).rejects.toMatchObject({
      code: 'INSPECTOR_NOTICE_NOT_FOUND',
      statusCode: 404,
    });
  });
});
