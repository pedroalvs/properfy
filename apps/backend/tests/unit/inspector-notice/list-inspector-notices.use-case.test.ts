import { describe, expect, it, vi } from 'vitest';
import { ListInspectorNoticesUseCase } from '../../../src/modules/inspector-notice/application/use-cases/list-inspector-notices.use-case';

const NOW = new Date('2026-11-10T00:00:00Z');

describe('ListInspectorNoticesUseCase', () => {
  it('maps rows to summaries, carries counts, and passes status/paging through', async () => {
    const repo = {
      listSummaries: vi.fn(async () => ({
        data: [
          {
            id: 'n1',
            title: 'Manual',
            body: 'b',
            critical: true,
            audience: { type: 'ALL' },
            authorUserId: 'u1',
            authorName: 'Ana Op',
            systemType: null,
            publishedAt: NOW,
            archivedAt: null,
            recipientCount: 10,
            readCount: 3,
          },
          {
            id: 'n2',
            title: 'Auto',
            body: 'b',
            critical: true,
            audience: { type: 'SYSTEM', systemType: 'ROUTE_PUBLISHED' },
            authorUserId: null,
            authorName: null,
            systemType: 'ROUTE_PUBLISHED',
            publishedAt: NOW,
            archivedAt: null,
            recipientCount: 4,
            readCount: 0,
          },
        ],
        total: 3,
      })),
    } as any;
    const useCase = new ListInspectorNoticesUseCase(repo);

    const result = await useCase.execute({ status: 'all', page: 2, pageSize: 1 });

    expect(repo.listSummaries).toHaveBeenCalledWith({ status: 'all', page: 2, pageSize: 1 });
    expect(result.total).toBe(3);
    expect(result.data[0]).toMatchObject({ recipientCount: 10, readCount: 3, author: { type: 'USER', name: 'Ana Op' } });
    expect(result.data[1].author).toEqual({ type: 'SYSTEM', name: null });
  });
});
