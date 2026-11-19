import { describe, expect, it, vi } from 'vitest';
import { GetMyInspectorNoticeUseCase } from '../../../src/modules/inspector-notice/application/use-cases/get-my-inspector-notice.use-case';

const NOW = new Date('2026-11-10T00:00:00Z');

describe('GetMyInspectorNoticeUseCase', () => {
  it('returns the mapped notice when the inspector is a visible recipient', async () => {
    const repo = {
      getMine: vi.fn(async () => ({ id: 'n1', title: 'T', body: 'B', critical: false, publishedAt: NOW, readAt: null })),
    } as any;
    const out = await new GetMyInspectorNoticeUseCase(repo).execute('i1', 'n1');
    expect(repo.getMine).toHaveBeenCalledWith('i1', 'n1');
    expect(out).toMatchObject({ id: 'n1', readAt: null });
  });

  it('throws 404 when not a recipient or archived (no existence leak)', async () => {
    const repo = { getMine: vi.fn(async () => null) } as any;
    await expect(new GetMyInspectorNoticeUseCase(repo).execute('i1', 'n1')).rejects.toMatchObject({
      code: 'INSPECTOR_NOTICE_NOT_FOUND',
      statusCode: 404,
    });
  });
});
