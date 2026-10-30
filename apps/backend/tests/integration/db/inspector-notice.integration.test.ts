import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PLATFORM_TIMEZONE } from '@properfy/shared';
import { civilDateInTimezone, parseDateInTimezone } from '../../../src/shared/domain/timezone-date';
import { setupDbHarness, teardownDbHarness, type DbHarness } from './harness';
import { PrismaInspectorNoticeRepository } from '../../../src/modules/inspector-notice/infrastructure/prisma-inspector-notice.repository';
import { PrismaPushSubscriptionRepository } from '../../../src/modules/inspector-notice/infrastructure/prisma-push-subscription.repository';
import { PrismaInspectorDirectoryRepository } from '../../../src/modules/inspector-notice/infrastructure/prisma-inspector-directory.repository';
import { PrismaNotificationRepository } from '../../../src/modules/notification/infrastructure/prisma-notification.repository';
import { PrismaNotificationTemplateRepository } from '../../../src/modules/notification/infrastructure/prisma-notification-template.repository';
import { PrismaIdempotencyService } from '../../../src/modules/inspector-execution/infrastructure/prisma-idempotency.service';
import { CreateNotificationUseCase } from '../../../src/modules/notification/application/use-cases/create-notification.use-case';
import { ResolveNoticeRecipientsService } from '../../../src/modules/inspector-notice/application/services/resolve-notice-recipients';
import { PublishInspectorNoticeUseCase } from '../../../src/modules/inspector-notice/application/use-cases/publish-inspector-notice.use-case';
import { DeliverInspectorNoticeUseCase } from '../../../src/modules/inspector-notice/application/use-cases/deliver-inspector-notice.use-case';
import { AutoArchiveInspectorNoticesUseCase } from '../../../src/modules/inspector-notice/application/use-cases/auto-archive-inspector-notices.use-case';
import { HasRecentSystemInspectorNoticeUseCase } from '../../../src/modules/inspector-notice/application/use-cases/has-recent-system-inspector-notice.use-case';
import { DisabledPushSender } from '../../../src/modules/inspector-notice/infrastructure/disabled-push.sender';
import type { IPushSender, PushSendOutcome } from '../../../src/modules/inspector-notice/domain/push-sender';
import { StubJobQueue } from '../../../src/shared/infrastructure/stub-job-queue';
import { syncPlatformTemplates } from '../../../src/shared/infrastructure/template-startup-check';
import { DeactivateInspectorUseCase } from '../../../src/modules/inspector/application/use-cases/deactivate-inspector.use-case';
import { PrismaInspectorRepository } from '../../../src/modules/inspector/infrastructure/prisma-inspector.repository';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';

const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, child: () => logger } as never;
const audit = { log: () => {} } as never;
const AM = { userId: 'AUTHOR', tenantId: null, role: 'AM' as const, branchId: null, inspectorId: null };

let harness: DbHarness;
let seq = 0;

function uniqueEmail(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}@example.com`;
}

async function seedInspector(opts: { phone?: string | null; withUser?: boolean; status?: 'ACTIVE' | 'INACTIVE' } = {}) {
  const prisma = harness.prisma;
  let userId: string | null = null;
  if (opts.withUser) {
    const user = await prisma.user.create({
      data: { role: 'INSP', name: 'Insp User', email: uniqueEmail('insp-user'), password_hash: 'x' },
    });
    userId = user.id;
  }
  const inspector = await prisma.inspector.create({
    data: {
      name: 'Inspector',
      email: uniqueEmail('insp'),
      phone: opts.phone === undefined ? '+61412345678' : opts.phone,
      status: opts.status ?? 'ACTIVE',
      user_id: userId,
    },
  });
  return inspector.id;
}

function buildDeps(pushSender: IPushSender, smsCap: number | null = null) {
  const prisma = harness.prisma;
  const noticeRepo = new PrismaInspectorNoticeRepository(prisma);
  const pushRepo = new PrismaPushSubscriptionRepository(prisma);
  const directoryRepo = new PrismaInspectorDirectoryRepository(prisma);
  const notificationRepo = new PrismaNotificationRepository(prisma);
  const templateRepo = new PrismaNotificationTemplateRepository(prisma);
  const idempotency = new PrismaIdempotencyService(prisma);
  const jobQueue = new StubJobQueue();
  const clock = { now: () => new Date() };
  const createNotification = new CreateNotificationUseCase(notificationRepo, templateRepo, jobQueue, logger);
  const resolve = new ResolveNoticeRecipientsService(directoryRepo);
  const publish = new PublishInspectorNoticeUseCase(prisma, noticeRepo, directoryRepo, resolve, idempotency, jobQueue, audit, clock, logger);
  const deliver = new DeliverInspectorNoticeUseCase(noticeRepo, pushRepo, pushSender, createNotification, notificationRepo, clock, smsCap, logger);
  return { prisma, noticeRepo, pushRepo, directoryRepo, notificationRepo, publish, deliver, idempotency };
}

const SENT_SENDER: IPushSender = { isEnabled: () => true, send: async (): Promise<PushSendOutcome> => ({ outcome: 'SENT' }) };

beforeAll(async () => {
  harness = await setupDbHarness();
  // Seed the author user (FK target) and the platform templates (incl. INSPECTOR_NOTICE_SMS).
  await harness.prisma.user.create({ data: { id: 'AUTHOR', role: 'AM', name: 'Ana Op', email: uniqueEmail('am'), password_hash: 'x' } });
  await syncPlatformTemplates(logger, harness.prisma);
}, 180_000);

afterAll(async () => {
  await teardownDbHarness(harness);
});

describe('inspector-notice DB integration', () => {
  it('syncPlatformTemplates seeds INSPECTOR_NOTICE_SMS as TRANSACTIONAL platform row', async () => {
    const row = await harness.prisma.notificationTemplate.findFirst({
      where: { tenant_id: null, template_code: 'INSPECTOR_NOTICE_SMS', channel: 'SMS' },
    });
    expect(row).not.toBeNull();
    expect(row!.notification_class).toBe('TRANSACTIONAL');
  });

  it('enforces the unique push endpoint and composite recipient PK; dedupe_key is unique but NULL repeats', async () => {
    const { prisma } = buildDeps(new DisabledPushSender());
    const inspectorId = await seedInspector();
    const endpoint = `https://push.example/${seq}-dup`;
    await prisma.inspectorPushSubscription.create({ data: { inspector_id: inspectorId, endpoint, p256dh: 'P', auth: 'A' } });
    await expect(
      prisma.inspectorPushSubscription.create({ data: { inspector_id: inspectorId, endpoint, p256dh: 'P', auth: 'A' } }),
    ).rejects.toMatchObject({ code: 'P2002' });

    // Two manual notices with NULL dedupe_key are allowed.
    const n1 = await prisma.inspectorNotice.create({ data: { title: 'a', body: 'b', audience_json: { type: 'ALL' } } });
    const n2 = await prisma.inspectorNotice.create({ data: { title: 'c', body: 'd', audience_json: { type: 'ALL' } } });
    expect(n1.id).not.toBe(n2.id);
    // Composite recipient PK rejects a duplicate pair.
    await prisma.inspectorNoticeRecipient.create({ data: { notice_id: n1.id, inspector_id: inspectorId } });
    await expect(
      prisma.inspectorNoticeRecipient.create({ data: { notice_id: n1.id, inspector_id: inspectorId } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('recomputes push_enabled from active subscriptions (0/1/2)', async () => {
    const { prisma, pushRepo } = buildDeps(new DisabledPushSender());
    const inspectorId = await seedInspector();
    await pushRepo.recomputePushEnabled(inspectorId);
    expect((await prisma.inspector.findUnique({ where: { id: inspectorId } }))!.push_enabled).toBe(false);

    await pushRepo.upsert({ inspectorId, endpoint: `https://push/${seq}-a`, p256dh: 'P', auth: 'A', now: new Date() });
    expect((await prisma.inspector.findUnique({ where: { id: inspectorId } }))!.push_enabled).toBe(true);

    await pushRepo.upsert({ inspectorId, endpoint: `https://push/${seq}-b`, p256dh: 'P', auth: 'A', now: new Date() });
    expect(await prisma.inspectorPushSubscription.count({ where: { inspector_id: inspectorId, revoked_at: null } })).toBe(2);
  });

  it('00.A2: a critical notice to an inspector without push produces one INSPECTOR_NOTICE_SMS row (idempotent on replay)', async () => {
    const { deliver, publish, notificationRepo } = buildDeps(new DisabledPushSender());
    const inspectorId = await seedInspector({ phone: '+61412345678' });
    const notice = await publish.execute({
      body: { title: 'Road closure', body: 'Pacific Hwy closed', critical: true, audience: { type: 'SELECTED', inspectorIds: [inspectorId] } },
      idempotencyKey: `k-${seq}`,
      actorUserId: 'AUTHOR',
    });
    await deliver.execute({ noticeId: notice.id });

    const rows = await harness.prisma.notification.findMany({
      where: { template_code: 'INSPECTOR_NOTICE_SMS', recipient: '+61412345678' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tenant_id: null, channel: 'SMS', notification_class: 'TRANSACTIONAL' });
    expect(rows[0].payload_json).toMatchObject({ message: expect.stringMatching(/^Properfy: /) });

    // Re-running the delivery does not create a second SMS (deterministic id + saveIfAbsent).
    await deliver.execute({ noticeId: notice.id });
    expect(await harness.prisma.notification.count({ where: { template_code: 'INSPECTOR_NOTICE_SMS', recipient: '+61412345678' } })).toBe(1);
    void notificationRepo;
  });

  it('00.A2 (SENT variant): a reached push produces no SMS', async () => {
    const { deliver, publish } = buildDeps(SENT_SENDER);
    const inspectorId = await seedInspector({ phone: '+61499999999' });
    await harness.prisma.inspectorPushSubscription.create({
      data: { inspector_id: inspectorId, endpoint: `https://push/${seq}-sent`, p256dh: 'P', auth: 'A' },
    });
    const notice = await publish.execute({
      body: { title: 'T', body: 'B', critical: true, audience: { type: 'SELECTED', inspectorIds: [inspectorId] } },
      idempotencyKey: `k-${seq}`,
      actorUserId: 'AUTHOR',
    });
    await deliver.execute({ noticeId: notice.id });
    expect(await harness.prisma.notification.count({ where: { recipient: '+61499999999' } })).toBe(0);
  });

  it('00.A4 + admin read path: summary/detail counts, author, recipient attrs, readCount 0→1', async () => {
    const { publish, noticeRepo } = buildDeps(new DisabledPushSender());
    const withUser = await seedInspector({ withUser: true });
    const noUser = await seedInspector({ withUser: false });
    const notice = await publish.execute({
      body: { title: 'Admin read', body: 'b', critical: false, audience: { type: 'SELECTED', inspectorIds: [withUser, noUser] } },
      idempotencyKey: `admin-${seq}`,
      actorUserId: 'AUTHOR',
    });

    const summary = await noticeRepo.getSummary(notice.id);
    expect(summary).toMatchObject({ recipientCount: 2, readCount: 0, authorUserId: 'AUTHOR', authorName: 'Ana Op' });

    const detail = await noticeRepo.getDetail(notice.id);
    expect(detail!.recipients).toHaveLength(2);
    expect(detail!.recipients.find((r) => r.inspectorId === withUser)).toMatchObject({ inspectorStatus: 'ACTIVE', hasAppAccess: true });
    expect(detail!.recipients.find((r) => r.inspectorId === noUser)).toMatchObject({ inspectorStatus: 'ACTIVE', hasAppAccess: false });

    // 00.A4: the recipient reads it → readCount goes 0 → 1 in summary, list and detail.
    expect(await noticeRepo.markRead(withUser, notice.id, new Date())).not.toBeNull();
    expect((await noticeRepo.getSummary(notice.id))!.readCount).toBe(1);
    const list = await noticeRepo.listSummaries({ status: 'active', page: 1, pageSize: 50 });
    expect(list.data.find((n) => n.id === notice.id)!.readCount).toBe(1);
    expect((await noticeRepo.getDetail(notice.id))!.recipients.filter((r) => r.readAt !== null)).toHaveLength(1);
  });

  it('7c: two concurrent publishes with the same Idempotency-Key create exactly one notice (advisory lock)', async () => {
    const { publish, prisma } = buildDeps(new DisabledPushSender());
    const inspectorId = await seedInspector();
    const key = `concurrent-${seq}`;
    const body = { title: 'Race', body: 'once', critical: false, audience: { type: 'SELECTED' as const, inspectorIds: [inspectorId] } };
    const [a, b] = await Promise.all([
      publish.execute({ body, idempotencyKey: key, actorUserId: 'AUTHOR' }),
      publish.execute({ body, idempotencyKey: key, actorUserId: 'AUTHOR' }),
    ]);
    expect(a.id).toBe(b.id);
    expect(await prisma.inspectorNotice.count({ where: { title: 'Race' } })).toBe(1);
  });

  it('L-F02-01: the daily SMS cap bounds how many SMS a delivery creates', async () => {
    // The cap counts ALL INSPECTOR_NOTICE_SMS rows since start-of-day Sydney, so earlier
    // tests in this shared DB already consumed some. Set the cap to currentCount + 1 so this
    // delivery can create exactly one more before the cap bites.
    const base = buildDeps(new DisabledPushSender());
    const startOfSydneyDay = parseDateInTimezone(civilDateInTimezone(new Date(), PLATFORM_TIMEZONE), PLATFORM_TIMEZONE);
    const currentCount = await base.notificationRepo.countByTemplateChannelSince(null, 'INSPECTOR_NOTICE_SMS', 'SMS', startOfSydneyDay);

    const { publish, deliver, prisma } = buildDeps(new DisabledPushSender(), currentCount + 1);
    const i1 = await seedInspector({ phone: '+61400000001' });
    const i2 = await seedInspector({ phone: '+61400000002' });
    const notice = await publish.execute({
      body: { title: 'Cap test', body: 'b', critical: true, audience: { type: 'SELECTED', inspectorIds: [i1, i2] } },
      idempotencyKey: `cap-${seq}`,
      actorUserId: 'AUTHOR',
    });
    await deliver.execute({ noticeId: notice.id });
    const created = await prisma.notification.count({
      where: { template_code: 'INSPECTOR_NOTICE_SMS', recipient: { in: ['+61400000001', '+61400000002'] } },
    });
    expect(created).toBe(1);
  });

  it('L-F08-06: existsSystemNoticeByDedupeKeyPrefixSince matches the literal prefix and honours since', async () => {
    const { noticeRepo, prisma } = buildDeps(new DisabledPushSender());
    const now = new Date();
    await prisma.inspectorNotice.create({
      data: { title: 't', body: 'b', audience_json: { type: 'SYSTEM', systemType: 'PERFORMANCE_MESSAGE' }, system_type: 'PERFORMANCE_MESSAGE', dedupe_key: `program-level:zz:${seq}`, created_at: now },
    });
    const useCase = new HasRecentSystemInspectorNoticeUseCase(noticeRepo);
    expect(await useCase.execute({ dedupeKeyPrefix: 'program-level:zz:', since: new Date(now.getTime() - 1000) })).toBe(true);
    expect(await useCase.execute({ dedupeKeyPrefix: 'program-level:zz:', since: new Date(now.getTime() + 60_000) })).toBe(false);
    expect(await useCase.execute({ dedupeKeyPrefix: 'program-level:other:', since: new Date(now.getTime() - 1000) })).toBe(false);
  });

  it('L-F02-06: auto-archive touches only old system notices and purges old revoked subscriptions', async () => {
    const { prisma, pushRepo, noticeRepo } = buildDeps(new DisabledPushSender());
    const now = Date.now();
    const oldSystem = await prisma.inspectorNotice.create({
      data: { title: 'sys', body: 'b', audience_json: { type: 'SYSTEM', systemType: 'ROUTE_PUBLISHED' }, system_type: 'ROUTE_PUBLISHED', dedupe_key: `arch-sys-${seq}`, published_at: new Date(now - 31 * 24 * 3600 * 1000) },
    });
    const oldManual = await prisma.inspectorNotice.create({
      data: { title: 'man', body: 'b', audience_json: { type: 'ALL' }, published_at: new Date(now - 400 * 24 * 3600 * 1000) },
    });
    const inspectorId = await seedInspector();
    await prisma.inspectorPushSubscription.create({
      data: { inspector_id: inspectorId, endpoint: `https://push/${seq}-purge`, p256dh: 'P', auth: 'A', revoked_at: new Date(now - 91 * 24 * 3600 * 1000), revoked_reason: 'GONE' },
    });

    const job = new AutoArchiveInspectorNoticesUseCase(noticeRepo, pushRepo, { now: () => new Date() }, 30, logger);
    await job.execute();

    expect((await prisma.inspectorNotice.findUnique({ where: { id: oldSystem.id } }))!.archived_at).not.toBeNull();
    expect((await prisma.inspectorNotice.findUnique({ where: { id: oldManual.id } }))!.archived_at).toBeNull();
    expect(await prisma.inspectorPushSubscription.findFirst({ where: { endpoint: `https://push/${seq}-purge` } })).toBeNull();
  });

  it('L-F02-11: deactivating an inspector revokes its active subscriptions and sets push_enabled false', async () => {
    const { prisma, pushRepo } = buildDeps(new DisabledPushSender());
    const inspectorId = await seedInspector();
    await pushRepo.upsert({ inspectorId, endpoint: `https://push/${seq}-d1`, p256dh: 'P', auth: 'A', now: new Date() });
    await pushRepo.upsert({ inspectorId, endpoint: `https://push/${seq}-d2`, p256dh: 'P', auth: 'A', now: new Date() });

    const inspectorRepo = new PrismaInspectorRepository(prisma);
    const checker = { countOpenAppointmentsForInspector: async () => ({ total: 0, byStatus: {} }) } as never;
    const useCase = new DeactivateInspectorUseCase(inspectorRepo, checker, audit, new AuthorizationService(audit), undefined, pushRepo);
    await useCase.execute({ inspectorId, reason: 'test', actor: AM });

    const subs = await prisma.inspectorPushSubscription.findMany({ where: { inspector_id: inspectorId } });
    expect(subs.every((s) => s.revoked_reason === 'DEACTIVATED' && s.revoked_at !== null)).toBe(true);
    expect((await prisma.inspector.findUnique({ where: { id: inspectorId } }))!.push_enabled).toBe(false);
  });

  it('§7.1 scoping: an inspector cannot read another inspector’s notices', async () => {
    const { publish, noticeRepo } = buildDeps(new DisabledPushSender());
    const inspectorA = await seedInspector();
    const inspectorB = await seedInspector();
    const notice = await publish.execute({
      body: { title: 'Only for A', body: 'b', critical: false, audience: { type: 'SELECTED', inspectorIds: [inspectorA] } },
      idempotencyKey: `scope-${seq}`,
      actorUserId: 'AUTHOR',
    });

    // A (the recipient) sees it; B does not.
    expect(await noticeRepo.getMine(inspectorA, notice.id)).not.toBeNull();
    expect(await noticeRepo.getMine(inspectorB, notice.id)).toBeNull();
    const bList = await noticeRepo.listMine({ inspectorId: inspectorB, page: 1, pageSize: 20 });
    expect(bList.data.some((n) => n.id === notice.id)).toBe(false);
    expect(await noticeRepo.markRead(inspectorB, notice.id, new Date())).toBeNull();
  });

  it('countByTemplateChannelSince counts only the template since the cutoff', async () => {
    const { notificationRepo, prisma } = buildDeps(new DisabledPushSender());
    const since = new Date(Date.now() - 3600_000);
    const before = await notificationRepo.countByTemplateChannelSince(null, 'INSPECTOR_NOTICE_SMS', 'SMS', since);
    await prisma.notification.create({
      data: { tenant_id: null, recipient: '+61400000099', channel: 'SMS', template_code: 'INSPECTOR_NOTICE_SMS', notification_class: 'TRANSACTIONAL', status: 'SENT', payload_json: {} },
    });
    const after = await notificationRepo.countByTemplateChannelSince(null, 'INSPECTOR_NOTICE_SMS', 'SMS', since);
    expect(after).toBe(before + 1);
  });
});
