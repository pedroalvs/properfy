import { describe, expect, it, vi } from 'vitest';
import { CountMyUnreadInspectorNoticesUseCase } from '../../../src/modules/inspector-notice/application/use-cases/count-my-unread-inspector-notices.use-case';

describe('CountMyUnreadInspectorNoticesUseCase', () => {
  it('wraps the repository count', async () => {
    const repo = { countMyUnread: vi.fn(async () => 4) } as any;
    expect(await new CountMyUnreadInspectorNoticesUseCase(repo).execute('i1')).toEqual({ count: 4 });
    expect(repo.countMyUnread).toHaveBeenCalledWith('i1');
  });

  it('returns zero when there are none', async () => {
    const repo = { countMyUnread: vi.fn(async () => 0) } as any;
    expect(await new CountMyUnreadInspectorNoticesUseCase(repo).execute('i1')).toEqual({ count: 0 });
  });
});
