import { describe, expect, it, vi } from 'vitest';
import { ArchiveInspectorNoticeUseCase } from '../../../src/modules/inspector-notice/application/use-cases/archive-inspector-notice.use-case';

const NOW = new Date('2026-11-10T00:00:00Z');
const ARCHIVED = new Date('2026-11-01T00:00:00Z');

function summaryRow(archivedAt: Date | null) {
  return {
    id: 'n1',
    title: 'T',
    body: 'B',
    critical: false,
    audience: { type: 'ALL' as const },
    authorUserId: 'u1',
    authorName: 'Ana Op',
    systemType: null,
    publishedAt: NOW,
    archivedAt,
    recipientCount: 3,
    readCount: 1,
  };
}

function make(archiveResult: unknown, summary: unknown = summaryRow(NOW)) {
  const repo = {
    archiveIfActive: vi.fn(async () => archiveResult),
    getSummary: vi.fn(async () => summary),
  } as any;
  const audit = { log: vi.fn() };
  const useCase = new ArchiveInspectorNoticeUseCase(repo, audit as any, { now: () => NOW });
  return { useCase, repo, audit };
}

describe('ArchiveInspectorNoticeUseCase', () => {
  it('archives an active notice and audits once', async () => {
    const entity = { id: 'n1', archivedAt: NOW } as any;
    const { useCase, audit } = make({ entity, changed: true });
    const out = await useCase.execute({ noticeId: 'n1', actorUserId: 'u1' });
    expect(out.archivedAt).toBe(NOW.toISOString());
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log.mock.calls[0][0]).toMatchObject({
      action: 'inspector_notice.archived',
      before: { archivedAt: null },
      after: { archivedAt: NOW.toISOString() },
      tenantId: null,
    });
  });

  it('is idempotent on an already-archived notice (no new audit)', async () => {
    const entity = { id: 'n1', archivedAt: ARCHIVED } as any;
    const { useCase, audit } = make({ entity, changed: false }, summaryRow(ARCHIVED));
    const out = await useCase.execute({ noticeId: 'n1', actorUserId: 'u1' });
    expect(out.archivedAt).toBe(ARCHIVED.toISOString());
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('writes no audit when the CAS lost the race', async () => {
    const entity = { id: 'n1', archivedAt: ARCHIVED } as any;
    const { useCase, audit } = make({ entity, changed: false }, summaryRow(ARCHIVED));
    await useCase.execute({ noticeId: 'n1', actorUserId: 'u1' });
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('throws 404 when the notice does not exist', async () => {
    const { useCase } = make(null);
    await expect(useCase.execute({ noticeId: 'nope', actorUserId: 'u1' })).rejects.toMatchObject({
      code: 'INSPECTOR_NOTICE_NOT_FOUND',
      statusCode: 404,
    });
  });
});
