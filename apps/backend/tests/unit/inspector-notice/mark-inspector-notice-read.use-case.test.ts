import { describe, expect, it, vi } from 'vitest';
import { MarkInspectorNoticeReadUseCase } from '../../../src/modules/inspector-notice/application/use-cases/mark-inspector-notice-read.use-case';

const NOW = new Date('2026-11-10T00:00:00Z');
const FIRST = new Date('2026-11-09T00:00:00Z');

describe('MarkInspectorNoticeReadUseCase', () => {
  it('returns the read timestamp the repository resolved (first read wins)', async () => {
    const repo = { markRead: vi.fn(async () => FIRST) } as any;
    const out = await new MarkInspectorNoticeReadUseCase(repo, { now: () => NOW }).execute('i1', 'n1');
    expect(repo.markRead).toHaveBeenCalledWith('i1', 'n1', NOW);
    expect(out).toEqual({ noticeId: 'n1', readAt: FIRST.toISOString() });
  });

  it('throws 404 when not a recipient or archived', async () => {
    const repo = { markRead: vi.fn(async () => null) } as any;
    await expect(
      new MarkInspectorNoticeReadUseCase(repo, { now: () => NOW }).execute('i1', 'n1'),
    ).rejects.toMatchObject({ code: 'INSPECTOR_NOTICE_NOT_FOUND', statusCode: 404 });
  });
});
