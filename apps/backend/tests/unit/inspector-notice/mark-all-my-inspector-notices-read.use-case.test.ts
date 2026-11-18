import { describe, expect, it, vi } from 'vitest';
import { MarkAllMyInspectorNoticesReadUseCase } from '../../../src/modules/inspector-notice/application/use-cases/mark-all-my-inspector-notices-read.use-case';

const NOW = new Date('2026-11-18T00:00:00Z');

describe('MarkAllMyInspectorNoticesReadUseCase', () => {
  it('marks the caller’s unread notices read and returns the flipped count', async () => {
    const repo = { markAllMineRead: vi.fn(async () => 3) } as any;
    const out = await new MarkAllMyInspectorNoticesReadUseCase(repo, { now: () => NOW }).execute('insp-1');
    expect(repo.markAllMineRead).toHaveBeenCalledWith('insp-1', NOW);
    expect(out).toEqual({ count: 3 });
  });

  it('is idempotent: returns { count: 0 } when nothing was unread', async () => {
    const repo = { markAllMineRead: vi.fn(async () => 0) } as any;
    const out = await new MarkAllMyInspectorNoticesReadUseCase(repo, { now: () => NOW }).execute('insp-1');
    expect(out).toEqual({ count: 0 });
  });
});
