import type { AuthContext } from '@properfy/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RecordConsentOptOutUseCase } from '../../../src/modules/notification/application/use-cases/record-consent-opt-out.use-case';
import { NotificationConsentEntity } from '../../../src/modules/notification/domain/notification-consent.entity';
import type { INotificationConsentRepository } from '../../../src/modules/notification/domain/notification-consent.repository';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import { ForbiddenError, ValidationError } from '../../../src/shared/domain/errors';

const TENANT = 'ag-syd';

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'am-1',
    role: 'AM',
    tenantId: null,
    sessionId: 's-1',
    branchId: null,
    inspectorId: null,
    ...overrides,
  } as AuthContext;
}

/** In-memory consent store keyed by scope, exposing findByScope for the block check. */
function makeStore() {
  const rows = new Map<string, NotificationConsentEntity>();
  const key = (tenantId: string, recipient: string, channel: string, cls: string) =>
    `${tenantId}|${recipient}|${channel}|${cls}`;
  const repo: INotificationConsentRepository = {
    findByRecipientChannelTenant: vi.fn(),
    findByScope: vi.fn(async (scope) =>
      rows.get(key(scope.tenantId ?? '', scope.recipient, scope.channel, scope.notificationClass)) ?? null,
    ),
    listByRecipient: vi.fn(),
    countSkippedForRecipient: vi.fn(),
    findById: vi.fn(),
    upsert: vi.fn(async (c) => {
      rows.set(key(c.tenantId, c.recipient, c.channel, c.notificationClass), c);
    }),
  };
  return { repo, rows, key };
}

describe('RecordConsentOptOutUseCase', () => {
  let store: ReturnType<typeof makeStore>;
  let audit: AuditService;
  let useCase: RecordConsentOptOutUseCase;

  beforeEach(() => {
    store = makeStore();
    audit = { log: vi.fn() } as unknown as AuditService;
    useCase = new RecordConsentOptOutUseCase(store.repo, new AuthorizationService(audit), audit);
  });

  const smsInput = {
    tenantId: TENANT,
    recipient: '+61412000001',
    channel: 'SMS' as const,
    reason: 'Tenant asked by phone to stop SMS',
    actor: makeActor(),
  };

  it('creates an opted-out record when none exists (before null) and audits', async () => {
    const out = await useCase.execute(smsInput);
    expect(out.optedOut).toBe(true);
    expect(out.changeSource).toBe('operator_override');
    expect(out.changedByUserId).toBe('am-1');
    expect(out.reason).toBe(smsInput.reason);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'consent.operator_opted_out', before: null }),
    );
  });

  it('flips an opted-in record to opted-out and records the before snapshot', async () => {
    const existing = new NotificationConsentEntity({
      id: 'c-1',
      recipient: '+61412000001',
      channel: 'SMS',
      tenantId: TENANT,
      notificationClass: 'OPERATIONAL',
      optedOut: false,
      optedOutAt: null,
      changeSource: null,
      changedAt: null,
      changedByUserId: null,
      reason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    store.rows.set(store.key(TENANT, '+61412000001', 'SMS', 'OPERATIONAL'), existing);

    await useCase.execute(smsInput);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'consent.operator_opted_out', before: expect.objectContaining({ optedOut: false }) }),
    );
  });

  it('is idempotent when already opted out (no new write or audit)', async () => {
    await useCase.execute(smsInput);
    vi.mocked(store.repo.upsert).mockClear();
    vi.mocked(audit.log).mockClear();

    const out = await useCase.execute(smsInput);
    expect(out.optedOut).toBe(true);
    expect(store.repo.upsert).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('rejects CL_ADMIN / CL_USER / INSP (403)', async () => {
    for (const role of ['CL_ADMIN', 'CL_USER', 'INSP'] as const) {
      await expect(
        useCase.execute({ ...smsInput, actor: makeActor({ role, tenantId: role === 'INSP' ? null : TENANT }) }),
      ).rejects.toThrow(ForbiddenError);
    }
  });

  it('rejects an empty or oversized reason', async () => {
    await expect(useCase.execute({ ...smsInput, reason: '   ' })).rejects.toThrow(ValidationError);
    await expect(useCase.execute({ ...smsInput, reason: 'x'.repeat(1001) })).rejects.toThrow(ValidationError);
  });

  it('normalizes a national phone to E.164 and a mixed-case email to lowercase', async () => {
    const phone = await useCase.execute({ ...smsInput, recipient: '0412 000 001' });
    expect(phone.recipient).toBe('+61412000001');
    const email = await useCase.execute({
      ...smsInput,
      recipient: 'Ana@Example.com',
      channel: 'EMAIL',
    });
    expect(email.recipient).toBe('ana@example.com');
  });

  it('blocks the next OPERATIONAL send for that recipient (findByScope → opted out)', async () => {
    await useCase.execute(smsInput);
    const found = await store.repo.findByScope({
      tenantId: TENANT,
      recipient: '+61412000001',
      channel: 'SMS',
      notificationClass: 'OPERATIONAL',
    });
    expect(found?.isOptedOut()).toBe(true);
  });
});
