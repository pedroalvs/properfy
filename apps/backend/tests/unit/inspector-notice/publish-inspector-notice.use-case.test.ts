import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublishInspectorNoticeUseCase } from '../../../src/modules/inspector-notice/application/use-cases/publish-inspector-notice.use-case';
import { ResolveNoticeRecipientsService } from '../../../src/modules/inspector-notice/application/services/resolve-notice-recipients';

const NOW = new Date('2026-11-10T00:00:00Z');

function makeDirectory(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    findAllActiveInspectorIds: vi.fn(async () => ['i1', 'i2']),
    findActiveInspectorIdsByIds: vi.fn(async (ids: string[]) => ids),
    findActiveInspectorIdsByRegion: vi.fn(async () => ['i1', 'i2']),
    findRegion: vi.fn(async () => ({ id: 'r1', name: 'North Shore', status: 'ACTIVE' })),
    findUserName: vi.fn(async () => 'Ana Op'),
    ...overrides,
  } as any;
}

function makeIdempotency() {
  const store = new Map<string, { response: unknown; payloadHash: string }>();
  return {
    store,
    getWithHash: vi.fn(async (key: string, scope: string) => store.get(`${scope}:${key}`) ?? null),
    set: vi.fn(async (key: string, scope: string, response: unknown, _ttl: number, payloadHash: string) => {
      store.set(`${scope}:${key}`, { response, payloadHash });
    }),
  } as any;
}

function makeNoticeRepo() {
  let seq = 0;
  const created: any[] = [];
  return {
    created,
    acquirePublishLock: vi.fn(async () => undefined),
    create: vi.fn(async (params: any) => {
      seq += 1;
      const entity = {
        id: `notice-${seq}`,
        title: params.title,
        body: params.body,
        critical: params.critical,
        audience: params.audience,
        systemType: params.systemType,
        dedupeKey: params.dedupeKey,
        targetPath: params.targetPath,
        authorUserId: params.authorUserId,
        publishedAt: params.now,
        archivedAt: null,
        deliveryStartedAt: null,
        deliveryCompletedAt: null,
        createdAt: params.now,
        updatedAt: params.now,
        recipientInspectorIds: params.recipientInspectorIds,
      };
      created.push(entity);
      return entity;
    }),
  } as any;
}

function makeUseCase(over: {
  directory?: any;
  idempotency?: any;
  repo?: any;
  jobQueue?: any;
  audit?: any;
} = {}) {
  const directory = over.directory ?? makeDirectory();
  const idempotency = over.idempotency ?? makeIdempotency();
  const repo = over.repo ?? makeNoticeRepo();
  const jobQueue = over.jobQueue ?? { enqueue: vi.fn(async () => undefined) };
  const audit = over.audit ?? { log: vi.fn() };
  const logger = { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() };
  const resolve = new ResolveNoticeRecipientsService(directory);
  const useCase = new PublishInspectorNoticeUseCase(
    undefined,
    repo,
    directory,
    resolve,
    idempotency,
    jobQueue,
    audit,
    { now: () => NOW },
    logger as any,
  );
  return { useCase, directory, idempotency, repo, jobQueue, audit, logger };
}

const ALL_BODY = { title: 'Road closure', body: 'Pacific Hwy closed', critical: false, audience: { type: 'ALL' as const } };

describe('PublishInspectorNoticeUseCase', () => {
  it('requires an Idempotency-Key', async () => {
    const { useCase } = makeUseCase();
    await expect(
      useCase.execute({ body: ALL_BODY, idempotencyKey: undefined, actorUserId: 'u1' }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_MISSING', statusCode: 400 });
  });

  it('publishes an ALL notice to the active inspectors and audits + enqueues after commit', async () => {
    const { useCase, repo, audit, jobQueue } = makeUseCase();
    const out = await useCase.execute({ body: ALL_BODY, idempotencyKey: 'k1', actorUserId: 'u1', requestId: 'req1' });

    expect(out.recipientCount).toBe(2);
    expect(out.readCount).toBe(0);
    expect(out.critical).toBe(false);
    expect(out.author).toEqual({ type: 'USER', name: 'Ana Op' });
    expect(out.audience).toEqual({ type: 'ALL' });
    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(repo.created[0].recipientInspectorIds).toEqual(['i1', 'i2']);
    expect(repo.created[0].authorUserId).toBe('u1');

    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log.mock.calls[0][0]).toMatchObject({
      action: 'inspector_notice.published',
      actorType: 'USER',
      actorId: 'u1',
      entityType: 'InspectorNotice',
      tenantId: null,
      requestId: 'req1',
      after: { recipientCount: 2, systemType: null },
    });

    expect(jobQueue.enqueue).toHaveBeenCalledTimes(1);
    const [job, payload, opts] = jobQueue.enqueue.mock.calls[0];
    expect(job).toBe('inspector-notice.deliver');
    expect(payload).toMatchObject({ noticeId: out.id });
    expect(opts).toMatchObject({ singletonKey: out.id, retryLimit: 3, retryBackoff: true, expireInMinutes: 15 });
  });

  it('sizes expireInMinutes by recipient volume', async () => {
    const directory = makeDirectory({
      findAllActiveInspectorIds: vi.fn(async () => Array.from({ length: 500 }, (_, i) => `i${i}`)),
    });
    const { useCase, jobQueue } = makeUseCase({ directory });
    await useCase.execute({ body: ALL_BODY, idempotencyKey: 'k1', actorUserId: 'u1' });
    expect(jobQueue.enqueue.mock.calls[0][2].expireInMinutes).toBe(22);
  });

  it('is idempotent on a repeated key + payload (one insert/audit/enqueue, same id)', async () => {
    const { useCase, repo, audit, jobQueue } = makeUseCase();
    const first = await useCase.execute({ body: ALL_BODY, idempotencyKey: 'k1', actorUserId: 'u1' });
    const second = await useCase.execute({ body: ALL_BODY, idempotencyKey: 'k1', actorUserId: 'u1' });
    expect(second.id).toBe(first.id);
    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(jobQueue.enqueue).toHaveBeenCalledTimes(1);
  });

  it('rejects a reused key with a different payload', async () => {
    const { useCase } = makeUseCase();
    await useCase.execute({ body: ALL_BODY, idempotencyKey: 'k1', actorUserId: 'u1' });
    await expect(
      useCase.execute({
        body: { ...ALL_BODY, title: 'Different' },
        idempotencyKey: 'k1',
        actorUserId: 'u1',
      }),
    ).rejects.toMatchObject({ code: 'INSPECTOR_NOTICE_IDEMPOTENCY_PAYLOAD_MISMATCH', statusCode: 409 });
  });

  it('rejects when the audience resolves to no recipients', async () => {
    const directory = makeDirectory({ findAllActiveInspectorIds: vi.fn(async () => []) });
    const { useCase, repo } = makeUseCase({ directory });
    await expect(
      useCase.execute({ body: ALL_BODY, idempotencyKey: 'k1', actorUserId: 'u1' }),
    ).rejects.toMatchObject({ code: 'INSPECTOR_NOTICE_NO_RECIPIENTS', statusCode: 422 });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('rejects SELECTED with inactive ids and lists them', async () => {
    const directory = makeDirectory({
      findActiveInspectorIdsByIds: vi.fn(async () => ['i1']),
    });
    const { useCase, repo } = makeUseCase({ directory });
    await expect(
      useCase.execute({
        body: { ...ALL_BODY, audience: { type: 'SELECTED', inspectorIds: ['i1', 'bad1', 'bad2'] } },
        idempotencyKey: 'k1',
        actorUserId: 'u1',
      }),
    ).rejects.toMatchObject({
      code: 'INSPECTOR_NOTICE_INVALID_RECIPIENTS',
      statusCode: 400,
      details: { inspectorIds: ['bad1', 'bad2'] },
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('snapshots the region name in the audience', async () => {
    const { useCase } = makeUseCase();
    const out = await useCase.execute({
      body: { ...ALL_BODY, audience: { type: 'REGION', regionId: 'r1' } },
      idempotencyKey: 'k1',
      actorUserId: 'u1',
    });
    expect(out.audience).toEqual({ type: 'REGION', regionId: 'r1', regionName: 'North Shore' });
  });

  it('does not throw when the delivery enqueue fails', async () => {
    const jobQueue = { enqueue: vi.fn(async () => { throw new Error('boom'); }) };
    const { useCase, logger } = makeUseCase({ jobQueue });
    const out = await useCase.execute({ body: { ...ALL_BODY, critical: true }, idempotencyKey: 'k1', actorUserId: 'u1' });
    expect(out.critical).toBe(true);
    expect(logger.error).toHaveBeenCalled();
  });
});
