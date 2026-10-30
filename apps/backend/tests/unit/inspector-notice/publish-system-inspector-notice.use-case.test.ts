import { describe, expect, it, vi } from 'vitest';
import { PublishSystemInspectorNoticeUseCase } from '../../../src/modules/inspector-notice/application/use-cases/publish-system-inspector-notice.use-case';

const NOW = new Date('2026-11-10T00:00:00Z');
const UUID = '11111111-1111-4111-8111-111111111111';

function build(over: { findByDedupeKey?: any; create?: any; activeIds?: string[] } = {}) {
  const created: any[] = [];
  let seq = 0;
  const repo = {
    findByDedupeKey: over.findByDedupeKey ?? vi.fn(async () => null),
    create:
      over.create ??
      vi.fn(async (params: any) => {
        seq += 1;
        const entity = { id: `sys-${seq}`, ...params, publishedAt: params.now, archivedAt: null };
        created.push(entity);
        return entity;
      }),
  } as any;
  const directory = {
    findActiveInspectorIdsByIds: vi.fn(async (ids: string[]) => over.activeIds ?? ids),
  } as any;
  const jobQueue = { enqueue: vi.fn(async () => undefined) };
  const audit = { log: vi.fn() };
  const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
  const useCase = new PublishSystemInspectorNoticeUseCase(
    undefined,
    repo,
    directory,
    jobQueue as any,
    audit as any,
    { now: () => NOW },
    logger as any,
  );
  return { useCase, repo, directory, jobQueue, audit, logger, created };
}

const base = { inspectorIds: ['i1'], title: 'Route published', body: 'Your route is ready', dedupeKey: 'route-published:dp1:1' };

describe('PublishSystemInspectorNoticeUseCase', () => {
  it('derives critical=true for ROUTE_PUBLISHED and sets SYSTEM audience + null author', async () => {
    const { useCase, created, audit } = build();
    const out = await useCase.execute({ ...base, type: 'ROUTE_PUBLISHED' });
    expect(out).toEqual({ noticeId: 'sys-1', created: true });
    expect(created[0]).toMatchObject({
      critical: true,
      systemType: 'ROUTE_PUBLISHED',
      authorUserId: null,
      audience: { type: 'SYSTEM', systemType: 'ROUTE_PUBLISHED' },
    });
    expect(audit.log.mock.calls[0][0]).toMatchObject({ actorType: 'SYSTEM', after: { systemType: 'ROUTE_PUBLISHED' } });
  });

  it('derives critical=true for COMPLETION_REMINDER (F03)', async () => {
    const { useCase, created } = build();
    await useCase.execute({ ...base, type: 'COMPLETION_REMINDER', dedupeKey: 'completion:a1:1' });
    expect(created[0].critical).toBe(true);
  });

  it('derives critical=false for PERFORMANCE_MESSAGE', async () => {
    const { useCase, created } = build();
    await useCase.execute({ ...base, type: 'PERFORMANCE_MESSAGE', dedupeKey: 'perf:i1:1' });
    expect(created[0].critical).toBe(false);
  });

  it('defaults target_path to null, accepts an allowlisted targetPath', async () => {
    const a = build();
    await a.useCase.execute({ ...base, type: 'ROUTE_PUBLISHED' });
    expect(a.created[0].targetPath).toBeNull();

    const b = build();
    await b.useCase.execute({ ...base, type: 'ROUTE_PUBLISHED', targetPath: `/schedule/${UUID}` });
    expect(b.created[0].targetPath).toBe(`/schedule/${UUID}`);
  });

  it.each(['/today', 'https://x', '/schedule/abc'])('rejects a non-allowlisted targetPath %s', async (targetPath) => {
    const { useCase, repo } = build();
    await expect(
      useCase.execute({ ...base, type: 'ROUTE_PUBLISHED', targetPath }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('is idempotent on a repeated dedupeKey (no insert/audit/enqueue)', async () => {
    const existing = { id: 'sys-existing' };
    const { useCase, repo, audit, jobQueue } = build({ findByDedupeKey: vi.fn(async () => existing) });
    const out = await useCase.execute({ ...base, type: 'ROUTE_PUBLISHED' });
    expect(out).toEqual({ noticeId: 'sys-existing', created: false });
    expect(repo.create).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
    expect(jobQueue.enqueue).not.toHaveBeenCalled();
  });

  it('treats a P2002 race as already-published', async () => {
    let calls = 0;
    const findByDedupeKey = vi.fn(async () => {
      calls += 1;
      return calls === 1 ? null : { id: 'sys-raced' };
    });
    const create = vi.fn(async () => {
      throw Object.assign(new Error('unique'), { code: 'P2002' });
    });
    const { useCase } = build({ findByDedupeKey, create });
    const out = await useCase.execute({ ...base, type: 'ROUTE_PUBLISHED' });
    expect(out).toEqual({ noticeId: 'sys-raced', created: false });
  });

  it('returns {noticeId:null, created:false} when all candidates are filtered out', async () => {
    const { useCase, repo, logger } = build({ activeIds: [] });
    const out = await useCase.execute({ ...base, type: 'ROUTE_PUBLISHED' });
    expect(out).toEqual({ noticeId: null, created: false });
    expect(repo.create).not.toHaveBeenCalled();
    expect(logger.info.mock.calls.some((c) => c[1] === 'inspector_notice.system_no_recipients')).toBe(true);
  });

  it('rejects invalid title/body (caller bug)', async () => {
    const { useCase } = build();
    await expect(useCase.execute({ ...base, type: 'ROUTE_PUBLISHED', title: '   ' })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(useCase.execute({ ...base, type: 'ROUTE_PUBLISHED', body: 'x'.repeat(2001) })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});
