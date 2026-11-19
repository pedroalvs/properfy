import { describe, expect, it, vi } from 'vitest';
import { ListMyInspectorNoticesUseCase } from '../../../src/modules/inspector-notice/application/use-cases/list-my-inspector-notices.use-case';

const NOW = new Date('2026-11-10T00:00:00Z');

describe('ListMyInspectorNoticesUseCase', () => {
  it('maps my-notice rows and returns a paginated envelope without unreadCount', async () => {
    const repo = {
      listMine: vi.fn(async () => ({
        data: [{ id: 'n1', title: 'T', body: 'B', critical: true, publishedAt: NOW, readAt: null }],
        total: 1,
      })),
    } as any;
    const result = await new ListMyInspectorNoticesUseCase(repo).execute({ inspectorId: 'i1', page: 1, pageSize: 20 });
    expect(repo.listMine).toHaveBeenCalledWith({ inspectorId: 'i1', page: 1, pageSize: 20 });
    expect(result).toEqual({
      data: [{ id: 'n1', title: 'T', body: 'B', critical: true, publishedAt: NOW.toISOString(), readAt: null }],
      total: 1,
    });
    expect('unreadCount' in result).toBe(false);
  });
});
