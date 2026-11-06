import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EnqueueTenantEtaOnDoneSubscriber } from '../../../src/modules/tenant-eta/application/subscribers/enqueue-tenant-eta-on-done.subscriber';
import { EnqueueTenantEtaOnCantDoSubscriber } from '../../../src/modules/tenant-eta/application/subscribers/enqueue-tenant-eta-on-cant-do.subscriber';
import { EnqueueTenantEtaOnLateNoticeSubscriber } from '../../../src/modules/tenant-eta/application/subscribers/enqueue-tenant-eta-on-late-notice.subscriber';
import type { DomainEvent } from '../../../src/shared/application/events/domain-event-bus';

const OCCURRED = new Date('2026-11-04T21:55:00.000Z');
const EPOCH = OCCURRED.getTime();

function event(payload: Record<string, unknown>): DomainEvent {
  return { type: 'x', payload, occurredAt: OCCURRED };
}

describe('EnqueueTenantEtaOnDoneSubscriber (L-F06-04)', () => {
  let jobQueue: { enqueue: ReturnType<typeof vi.fn> };
  let logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
  let sub: EnqueueTenantEtaOnDoneSubscriber;
  beforeEach(() => {
    jobQueue = { enqueue: vi.fn().mockResolvedValue(undefined) };
    logger = { info: vi.fn(), warn: vi.fn() };
    sub = new EnqueueTenantEtaOnDoneSubscriber(jobQueue as never, logger as never);
  });

  it('enqueues FINISH for a check-out DONE with occurredAt from the envelope', async () => {
    await sub.handle(event({ appointmentId: 'a1', tenantId: 't1', toStatus: 'DONE', metadata: { source: 'INSPECTOR_FINISH' } }));
    expect(jobQueue.enqueue).toHaveBeenCalledWith(
      'tenant-eta.evaluate',
      { trigger: 'FINISH', appointmentId: 'a1', tenantId: 't1', occurredAt: OCCURRED.toISOString(), attempt: 1 },
      { singletonKey: `tenant-eta:FINISH:a1:${EPOCH}`, retryLimit: 2, retryBackoff: true, expireInMinutes: 5 },
    );
  });

  it('skips a manual DONE (no source) with enqueue_skipped MANUAL_DONE', async () => {
    await sub.handle(event({ appointmentId: 'a1', tenantId: 't1', toStatus: 'DONE' }));
    expect(jobQueue.enqueue).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith({ appointmentId: 'a1', reason: 'MANUAL_DONE' }, 'tenant_eta.enqueue_skipped');
  });

  it('does nothing for a non-DONE status or a non-finish source on DONE', async () => {
    await sub.handle(event({ appointmentId: 'a1', tenantId: 't1', toStatus: 'SCHEDULED' }));
    await sub.handle(event({ appointmentId: 'a1', tenantId: 't1', toStatus: 'DONE', metadata: { source: 'INSPECTOR_CANT_DO' } }));
    expect(jobQueue.enqueue).not.toHaveBeenCalled();
  });

  it('never rethrows an enqueue failure', async () => {
    jobQueue.enqueue.mockRejectedValueOnce(new Error('boom'));
    await expect(sub.handle(event({ appointmentId: 'a1', tenantId: 't1', toStatus: 'DONE', metadata: { source: 'INSPECTOR_FINISH' } }))).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ appointmentId: 'a1' }), 'tenant_eta.enqueue_failed');
  });
});

describe('EnqueueTenantEtaOnCantDoSubscriber (D16)', () => {
  let jobQueue: { enqueue: ReturnType<typeof vi.fn> };
  let logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
  let sub: EnqueueTenantEtaOnCantDoSubscriber;
  beforeEach(() => {
    jobQueue = { enqueue: vi.fn().mockResolvedValue(undefined) };
    logger = { info: vi.fn(), warn: vi.fn() };
    sub = new EnqueueTenantEtaOnCantDoSubscriber(jobQueue as never, logger as never);
  });

  it('enqueues CANT_DO carrying the initiating inspector', async () => {
    await sub.handle(event({ appointmentId: 'a1', tenantId: 't1', toStatus: 'REJECTED', metadata: { source: 'INSPECTOR_CANT_DO', initiatedByInspectorId: 'insp-9' } }));
    expect(jobQueue.enqueue).toHaveBeenCalledWith(
      'tenant-eta.evaluate',
      { trigger: 'CANT_DO', appointmentId: 'a1', tenantId: 't1', inspectorId: 'insp-9', occurredAt: OCCURRED.toISOString(), attempt: 1 },
      { singletonKey: `tenant-eta:CANT_DO:a1:${EPOCH}`, retryLimit: 2, retryBackoff: true, expireInMinutes: 5 },
    );
  });

  it('ignores a REJECTED from another origin', async () => {
    await sub.handle(event({ appointmentId: 'a1', tenantId: 't1', toStatus: 'REJECTED', metadata: { source: 'TENANT_DECLINED' } }));
    await sub.handle(event({ appointmentId: 'a1', tenantId: 't1', toStatus: 'REJECTED' }));
    expect(jobQueue.enqueue).not.toHaveBeenCalled();
  });

  it('skips with NO_INSPECTOR when the inspector id is missing', async () => {
    await sub.handle(event({ appointmentId: 'a1', tenantId: 't1', toStatus: 'REJECTED', metadata: { source: 'INSPECTOR_CANT_DO' } }));
    expect(jobQueue.enqueue).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith({ appointmentId: 'a1', reason: 'NO_INSPECTOR' }, 'tenant_eta.enqueue_skipped');
  });
});

describe('EnqueueTenantEtaOnLateNoticeSubscriber', () => {
  let jobQueue: { enqueue: ReturnType<typeof vi.fn> };
  let logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
  let sub: EnqueueTenantEtaOnLateNoticeSubscriber;
  beforeEach(() => {
    jobQueue = { enqueue: vi.fn().mockResolvedValue(undefined) };
    logger = { info: vi.fn(), warn: vi.fn() };
    sub = new EnqueueTenantEtaOnLateNoticeSubscriber(jobQueue as never, logger as never);
  });

  it('enqueues LATE_NOTICE keyed by eventId', async () => {
    await sub.handle(event({ type: 'LATE_NOTICE', appointmentId: 'a1', tenantId: 't1', eventId: 'ev-1' }));
    expect(jobQueue.enqueue).toHaveBeenCalledWith(
      'tenant-eta.evaluate',
      { trigger: 'LATE_NOTICE', appointmentId: 'a1', tenantId: 't1', eventId: 'ev-1', attempt: 1 },
      { singletonKey: 'tenant-eta:LATE_NOTICE:ev-1', retryLimit: 2, retryBackoff: true, expireInMinutes: 5 },
    );
  });

  it('ignores a non-late-notice field event (CANT_DO)', async () => {
    await sub.handle(event({ type: 'CANT_DO', appointmentId: 'a1', tenantId: 't1', eventId: 'ev-2' }));
    expect(jobQueue.enqueue).not.toHaveBeenCalled();
  });
});
