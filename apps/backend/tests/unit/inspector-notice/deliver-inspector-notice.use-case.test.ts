import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeliverInspectorNoticeUseCase } from '../../../src/modules/inspector-notice/application/use-cases/deliver-inspector-notice.use-case';
import { getInspectorNoticeSmsNotificationId } from '../../../src/modules/inspector-notice/domain/sms-notification-id';
import type { PushSendOutcome } from '../../../src/modules/inspector-notice/domain/push-sender';

const NOW = new Date('2026-11-10T00:00:00Z');

interface RecipientSpec {
  inspectorId: string;
  status?: 'ACTIVE' | 'INACTIVE';
  deleted?: boolean;
  phone?: string | null;
}

function makeNotice(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'n1',
    title: 'Road closure',
    body: 'Pacific Hwy closed',
    critical: true,
    audience: { type: 'ALL' },
    systemType: null,
    dedupeKey: null,
    targetPath: null,
    authorUserId: 'u1',
    publishedAt: NOW,
    archivedAt: null as Date | null,
    deliveryStartedAt: null,
    deliveryCompletedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  };
}

function makeNoticeRepo(notice: any, recipients: RecipientSpec[], opts: { archiveOnFindCall?: number } = {}) {
  const rows = recipients.map((r) => ({
    inspectorId: r.inspectorId,
    inspectorStatus: r.status ?? 'ACTIVE',
    inspectorDeleted: r.deleted ?? false,
    phone: r.phone === undefined ? '+61412345678' : r.phone,
    processed: false,
  }));
  let findCalls = 0;
  const calls = { completedAt: null as Date | null, markAllProcessed: 0 };
  return {
    rows,
    calls,
    findById: vi.fn(async () => {
      findCalls += 1;
      if (opts.archiveOnFindCall && findCalls >= opts.archiveOnFindCall) {
        return { ...notice, archivedAt: NOW };
      }
      return { ...notice };
    }),
    markDeliveryStarted: vi.fn(async () => undefined),
    markDeliveryCompleted: vi.fn(async (_id: string, at: Date) => {
      calls.completedAt = at;
    }),
    listPendingDeliveryRecipients: vi.fn(async (_id: string, limit: number) =>
      rows.filter((r) => !r.processed).slice(0, limit).map((r) => ({
        inspectorId: r.inspectorId,
        inspectorStatus: r.inspectorStatus,
        inspectorDeleted: r.inspectorDeleted,
        phone: r.phone,
      })),
    ),
    markRecipientProcessed: vi.fn(async (_id: string, inspectorId: string) => {
      const row = rows.find((r) => r.inspectorId === inspectorId);
      if (row) row.processed = true;
    }),
    markAllPendingProcessed: vi.fn(async () => {
      const n = rows.filter((r) => !r.processed).length;
      rows.forEach((r) => {
        r.processed = true;
      });
      calls.markAllProcessed = n;
      return n;
    }),
  } as any;
}

function makePushRepo(subsByInspector: Record<string, any[]> = {}, incrementReturns: number | null = 1) {
  return {
    findActiveByInspector: vi.fn(async (inspectorId: string) => subsByInspector[inspectorId] ?? []),
    revoke: vi.fn(async () => undefined),
    resetFailure: vi.fn(async () => undefined),
    incrementFailure: vi.fn(async () => incrementReturns),
  } as any;
}

function makeSender(outcome: PushSendOutcome | PushSendOutcome[] = { outcome: 'SENT' }) {
  const seq = Array.isArray(outcome) ? [...outcome] : null;
  return {
    isEnabled: () => true,
    send: vi.fn(async () => (seq ? seq.shift()! : (outcome as PushSendOutcome))),
  } as any;
}

function build(opts: {
  notice?: any;
  recipients: RecipientSpec[];
  subs?: Record<string, any[]>;
  sender?: any;
  incrementReturns?: number | null;
  dailyCount?: number;
  cap?: number | null;
  archiveOnFindCall?: number;
  now?: Date;
}) {
  const notice = opts.notice ?? makeNotice();
  const repo = makeNoticeRepo(notice, opts.recipients, { archiveOnFindCall: opts.archiveOnFindCall });
  const pushRepo = makePushRepo(opts.subs ?? {}, opts.incrementReturns ?? 1);
  const sender = opts.sender ?? makeSender();
  const createNotification = { execute: vi.fn(async (i: any) => ({ notificationId: i.notificationId })) };
  const smsCounter = { countByTemplateChannelSince: vi.fn(async () => opts.dailyCount ?? 0) };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const useCase = new DeliverInspectorNoticeUseCase(
    repo,
    pushRepo,
    sender,
    createNotification as any,
    smsCounter as any,
    { now: () => opts.now ?? NOW },
    opts.cap === undefined ? 500 : opts.cap,
    logger as any,
  );
  return { useCase, repo, pushRepo, sender, createNotification, smsCounter, logger };
}

const sub = (endpoint = 'https://push/x') => ({ id: endpoint, endpoint, p256dh: 'P', auth: 'A', failureCount: 0 });

function lastLog(logger: any, event: string) {
  const call = [...logger.info.mock.calls, ...logger.warn.mock.calls].find((c) => c[1] === event);
  return call?.[0];
}

describe('DeliverInspectorNoticeUseCase', () => {
  it('1: critical + active push → 1 push, no SMS', async () => {
    const { useCase, sender, createNotification } = build({
      recipients: [{ inspectorId: 'i1' }],
      subs: { i1: [sub()] },
    });
    await useCase.execute({ noticeId: 'n1' });
    expect(sender.send).toHaveBeenCalledTimes(1);
    expect(createNotification.execute).not.toHaveBeenCalled();
  });

  it('2: critical + no push + phone → SMS with deterministic id, tenantId null, template', async () => {
    const { useCase, createNotification } = build({ recipients: [{ inspectorId: 'i1' }] });
    await useCase.execute({ noticeId: 'n1' });
    expect(createNotification.execute).toHaveBeenCalledTimes(1);
    expect(createNotification.execute.mock.calls[0][0]).toMatchObject({
      notificationId: getInspectorNoticeSmsNotificationId('n1', 'i1'),
      tenantId: null,
      recipient: '+61412345678',
      channel: 'SMS',
      templateCode: 'INSPECTOR_NOTICE_SMS',
    });
    expect(createNotification.execute.mock.calls[0][0].payloadJson.message).toMatch(/^Properfy: /);
  });

  it('3/4: critical + GONE → revoke GONE, SMS created', async () => {
    const { useCase, pushRepo, createNotification } = build({
      recipients: [{ inspectorId: 'i1' }],
      subs: { i1: [sub()] },
      sender: makeSender({ outcome: 'GONE', statusCode: 410 }),
    });
    await useCase.execute({ noticeId: 'n1' });
    expect(pushRepo.revoke).toHaveBeenCalledWith('https://push/x', 'GONE', NOW);
    expect(createNotification.execute).toHaveBeenCalledTimes(1);
  });

  it('5: critical + SENT + GONE → 1 revoked, no SMS', async () => {
    const { useCase, pushRepo, createNotification } = build({
      recipients: [{ inspectorId: 'i1' }],
      subs: { i1: [sub('a'), sub('b')] },
      sender: makeSender([{ outcome: 'SENT' }, { outcome: 'GONE', statusCode: 404 }]),
    });
    await useCase.execute({ noticeId: 'n1' });
    expect(pushRepo.revoke).toHaveBeenCalledTimes(1);
    expect(createNotification.execute).not.toHaveBeenCalled();
  });

  it('6: critical + FAILED → not revoked, failure++, SMS created (D2-a)', async () => {
    const { useCase, pushRepo, createNotification, logger } = build({
      recipients: [{ inspectorId: 'i1' }],
      subs: { i1: [sub()] },
      sender: makeSender({ outcome: 'FAILED', statusCode: 500 }),
      incrementReturns: 1,
    });
    await useCase.execute({ noticeId: 'n1' });
    expect(pushRepo.incrementFailure).toHaveBeenCalledWith('https://push/x');
    expect(pushRepo.revoke).not.toHaveBeenCalled();
    expect(createNotification.execute).toHaveBeenCalledTimes(1);
    expect(lastLog(logger, 'inspector_notice.push_failed')).toBeTruthy();
  });

  it('6c: non-critical + FAILED → no SMS', async () => {
    const { useCase, createNotification } = build({
      notice: makeNotice({ critical: false }),
      recipients: [{ inspectorId: 'i1' }],
      subs: { i1: [sub()] },
      sender: makeSender({ outcome: 'FAILED', statusCode: 500 }),
    });
    await useCase.execute({ noticeId: 'n1' });
    expect(createNotification.execute).not.toHaveBeenCalled();
  });

  it('7: critical + no push + no phone → no SMS, warn', async () => {
    const { useCase, createNotification, logger } = build({ recipients: [{ inspectorId: 'i1', phone: null }] });
    await useCase.execute({ noticeId: 'n1' });
    expect(createNotification.execute).not.toHaveBeenCalled();
    expect(lastLog(logger, 'inspector_notice.sms_skipped_no_phone')).toBeTruthy();
  });

  it('8: non-critical + no push → nothing', async () => {
    const { useCase, sender, createNotification } = build({
      notice: makeNotice({ critical: false }),
      recipients: [{ inspectorId: 'i1' }],
    });
    await useCase.execute({ noticeId: 'n1' });
    expect(sender.send).not.toHaveBeenCalled();
    expect(createNotification.execute).not.toHaveBeenCalled();
  });

  it('11: VAPID disabled sender → treated as no reach → SMS', async () => {
    const disabled = { isEnabled: () => false, send: vi.fn(async () => ({ outcome: 'DISABLED' as const })) };
    const { useCase, createNotification } = build({
      recipients: [{ inspectorId: 'i1' }],
      subs: { i1: [sub()] },
      sender: disabled,
    });
    await useCase.execute({ noticeId: 'n1' });
    expect(createNotification.execute).toHaveBeenCalledTimes(1);
  });

  it('15: inactive/soft-deleted inspector → nothing sent, marked processed', async () => {
    const { useCase, sender, createNotification, repo } = build({
      recipients: [{ inspectorId: 'i1', status: 'INACTIVE' }],
      subs: { i1: [sub()] },
    });
    await useCase.execute({ noticeId: 'n1' });
    expect(sender.send).not.toHaveBeenCalled();
    expect(createNotification.execute).not.toHaveBeenCalled();
    expect(repo.markRecipientProcessed).toHaveBeenCalledWith('n1', 'i1', NOW);
  });

  it('16: push payload shape and options', async () => {
    const { useCase, sender } = build({
      notice: makeNotice({ body: 'B', targetPath: null }),
      recipients: [{ inspectorId: 'i1' }],
      subs: { i1: [sub()] },
    });
    await useCase.execute({ noticeId: 'n1' });
    const [target, payload, opts] = sender.send.mock.calls[0];
    expect(target).toMatchObject({ endpoint: 'https://push/x' });
    expect(payload).toEqual({ v: 1, noticeId: 'n1', title: 'Road closure', body: 'B', critical: true, url: '/profile/announcements/n1' });
    expect(opts).toEqual({ ttlSeconds: 86400, urgency: 'high' });
  });

  it('16b: system targetPath /schedule/:id flows into the push url', async () => {
    const uuid = '11111111-1111-4111-8111-111111111111';
    const { useCase, sender } = build({
      notice: makeNotice({ targetPath: `/schedule/${uuid}` }),
      recipients: [{ inspectorId: 'i1' }],
      subs: { i1: [sub()] },
    });
    await useCase.execute({ noticeId: 'n1' });
    expect(sender.send.mock.calls[0][1].url).toBe(`/schedule/${uuid}`);
  });

  it('17: completion summary carries sydneyHour (11:40Z → 22 AEDT)', async () => {
    const { useCase, logger } = build({
      recipients: [{ inspectorId: 'i1' }],
      subs: { i1: [sub()] },
      now: new Date('2026-11-10T11:40:00Z'),
    });
    await useCase.execute({ noticeId: 'n1' });
    expect(lastLog(logger, 'inspector_notice.delivery_completed')).toMatchObject({ sydneyHour: 22, pushSent: 1 });
  });

  it('18: REJECTED (401/403) → revoke REJECTED, SMS created', async () => {
    const { useCase, pushRepo, createNotification } = build({
      recipients: [{ inspectorId: 'i1' }],
      subs: { i1: [sub()] },
      sender: makeSender({ outcome: 'REJECTED', statusCode: 401 }),
    });
    await useCase.execute({ noticeId: 'n1' });
    expect(pushRepo.revoke).toHaveBeenCalledWith('https://push/x', 'REJECTED', NOW);
    expect(createNotification.execute).toHaveBeenCalledTimes(1);
  });

  it('19: FAILED reaching 5 → revoke FAILED', async () => {
    const { useCase, pushRepo } = build({
      recipients: [{ inspectorId: 'i1' }],
      subs: { i1: [sub()] },
      sender: makeSender({ outcome: 'FAILED', statusCode: 429 }),
      incrementReturns: 5,
    });
    await useCase.execute({ noticeId: 'n1' });
    expect(pushRepo.revoke).toHaveBeenCalledWith('https://push/x', 'FAILED', NOW);
  });

  it('20: non-critical SENT → resetFailure, no SMS', async () => {
    const { useCase, pushRepo, createNotification } = build({
      notice: makeNotice({ critical: false }),
      recipients: [{ inspectorId: 'i1' }],
      subs: { i1: [sub()] },
    });
    await useCase.execute({ noticeId: 'n1' });
    expect(pushRepo.resetFailure).toHaveBeenCalledWith('https://push/x');
    expect(createNotification.execute).not.toHaveBeenCalled();
  });

  it('21: cap reached (count already at cap) → no SMS, skip counted, warn once', async () => {
    const { useCase, createNotification, logger } = build({
      recipients: [{ inspectorId: 'i1' }],
      cap: 2,
      dailyCount: 2,
    });
    await useCase.execute({ noticeId: 'n1' });
    expect(createNotification.execute).not.toHaveBeenCalled();
    expect(lastLog(logger, 'inspector_notice.sms_cap_reached')).toMatchObject({ cap: 2 });
  });

  it('21b: cap partially available → first SMS sent, rest capped', async () => {
    const { useCase, createNotification, logger } = build({
      recipients: [{ inspectorId: 'i1' }, { inspectorId: 'i2' }, { inspectorId: 'i3' }],
      cap: 2,
      dailyCount: 1,
    });
    await useCase.execute({ noticeId: 'n1' });
    expect(createNotification.execute).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls.filter((c) => c[1] === 'inspector_notice.sms_cap_reached')).toHaveLength(1);
  });

  it('21c: cap null → SMS created, counter not consulted', async () => {
    const { useCase, createNotification, smsCounter } = build({
      recipients: [{ inspectorId: 'i1' }],
      cap: null,
    });
    await useCase.execute({ noticeId: 'n1' });
    expect(createNotification.execute).toHaveBeenCalledTimes(1);
    expect(smsCounter.countByTemplateChannelSince).not.toHaveBeenCalled();
  });

  it('22: burst warn at >= 20 queued SMS, none at 19', async () => {
    const twenty = Array.from({ length: 20 }, (_, i) => ({ inspectorId: `i${i}` }));
    const r1 = build({ recipients: twenty, cap: null });
    await r1.useCase.execute({ noticeId: 'n1' });
    expect(lastLog(r1.logger, 'inspector_notice.sms_burst')).toMatchObject({ smsQueued: 20 });

    const nineteen = Array.from({ length: 19 }, (_, i) => ({ inspectorId: `i${i}` }));
    const r2 = build({ recipients: nineteen, cap: null });
    await r2.useCase.execute({ noticeId: 'n1' });
    expect(r2.logger.warn.mock.calls.find((c) => c[1] === 'inspector_notice.sms_burst')).toBeUndefined();
  });

  it('14: archived before the job → skipped, nothing sent', async () => {
    const { useCase, sender, createNotification, repo, logger } = build({
      notice: makeNotice({ archivedAt: NOW }),
      recipients: [{ inspectorId: 'i1' }],
      subs: { i1: [sub()] },
    });
    await useCase.execute({ noticeId: 'n1' });
    expect(sender.send).not.toHaveBeenCalled();
    expect(createNotification.execute).not.toHaveBeenCalled();
    expect(repo.markDeliveryStarted).not.toHaveBeenCalled();
    expect(lastLog(logger, 'inspector_notice.delivery_skipped_archived')).toMatchObject({ processed: 0 });
  });

  it('23: archived between batch 1 and 2 → later batches skipped', async () => {
    const recipients = Array.from({ length: 120 }, (_, i) => ({ inspectorId: `i${i}` }));
    // find call #1 (batch 1) not archived; call #2 (before batch 2) archived.
    const { useCase, createNotification, logger, repo } = build({
      recipients,
      cap: null,
      archiveOnFindCall: 2,
    });
    await useCase.execute({ noticeId: 'n1' });
    // batch 1 = 50 recipients, all critical w/o push → 50 SMS; remaining 70 skipped.
    expect(createNotification.execute).toHaveBeenCalledTimes(50);
    expect(lastLog(logger, 'inspector_notice.delivery_skipped_archived')).toMatchObject({ processed: 50, skipped: 70 });
    expect(repo.calls.completedAt).not.toBeNull();
  });

  it('24: completion sets completed_at at the end of a normal run', async () => {
    const { useCase, repo } = build({ recipients: [{ inspectorId: 'i1' }], subs: { i1: [sub()] } });
    await useCase.execute({ noticeId: 'n1' });
    expect(repo.markDeliveryCompleted).toHaveBeenCalled();
    expect(repo.calls.completedAt).toEqual(NOW);
  });
});
