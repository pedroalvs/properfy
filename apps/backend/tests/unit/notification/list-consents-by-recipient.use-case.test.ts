import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ListConsentsByRecipientUseCase } from '../../../src/modules/notification/application/use-cases/list-consents-by-recipient.use-case';
import type { INotificationConsentRepository } from '../../../src/modules/notification/domain/notification-consent.repository';
import { NotificationConsentEntity } from '../../../src/modules/notification/domain/notification-consent.entity';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { ForbiddenError, ValidationError } from '../../../src/shared/domain/errors';

const now = new Date('2026-04-01T00:00:00.000Z');

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    tenantId: 'tenant-1',
    role: 'OP',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

function makeConsent(overrides: Partial<ConstructorParameters<typeof NotificationConsentEntity>[0]> = {}) {
  return new NotificationConsentEntity({
    id: 'consent-1',
    recipient: 'user@example.com',
    channel: 'EMAIL',
    tenantId: 'tenant-1',
    notificationClass: 'OPERATIONAL',
    optedOut: true,
    optedOutAt: now,
    changeSource: 'unsubscribe_link',
    changedAt: now,
    changedByUserId: null,
    reason: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

describe('ListConsentsByRecipientUseCase', () => {
  let consentRepo: INotificationConsentRepository;
  let auditService: AuditService;
  let authorizationService: AuthorizationService;
  let useCase: ListConsentsByRecipientUseCase;

  beforeEach(() => {
    consentRepo = {
      findByRecipientChannelTenant: vi.fn(),
      findByScope: vi.fn(),
      listByRecipient: vi.fn().mockResolvedValue([]),
      countSkippedForRecipient: vi.fn().mockResolvedValue(0),
      findById: vi.fn(),
      upsert: vi.fn(),
    };
    auditService = { log: vi.fn() };
    authorizationService = new AuthorizationService(auditService);
    useCase = new ListConsentsByRecipientUseCase(consentRepo, authorizationService);
  });

  it('allows OP to list within own tenant', async () => {
    vi.mocked(consentRepo.listByRecipient).mockResolvedValue([makeConsent()]);
    vi.mocked(consentRepo.countSkippedForRecipient).mockResolvedValue(3);

    const result = await useCase.execute({
      recipient: 'user@example.com',
      actor: makeActor({ role: 'OP', tenantId: 'tenant-1' }),
    });

    expect(result.recipient).toBe('user@example.com');
    expect(result.entries).toHaveLength(1);
    expect(result.skippedCount).toBe(3);
  });

  it('forces OP to own tenantId (ignores input tenantId)', async () => {
    vi.mocked(consentRepo.listByRecipient).mockResolvedValue([]);

    await useCase.execute({
      recipient: 'user@example.com',
      tenantId: 'tenant-other',
      actor: makeActor({ role: 'OP', tenantId: 'tenant-1' }),
    });

    const call = vi.mocked(consentRepo.listByRecipient).mock.calls[0][0];
    expect(call.tenantId).toBe('tenant-1');
  });

  it('requires AM to provide tenantId', async () => {
    await expect(
      useCase.execute({
        recipient: 'user@example.com',
        actor: makeActor({ role: 'AM', tenantId: null }),
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('allows AM to query any tenant', async () => {
    vi.mocked(consentRepo.listByRecipient).mockResolvedValue([]);

    await useCase.execute({
      recipient: 'user@example.com',
      tenantId: 'tenant-7',
      actor: makeActor({ role: 'AM', tenantId: null }),
    });

    const call = vi.mocked(consentRepo.listByRecipient).mock.calls[0][0];
    expect(call.tenantId).toBe('tenant-7');
  });

  it('rejects CL_ADMIN with ForbiddenError', async () => {
    await expect(
      useCase.execute({
        recipient: 'user@example.com',
        actor: makeActor({ role: 'CL_ADMIN' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('rejects CL_USER with ForbiddenError', async () => {
    await expect(
      useCase.execute({
        recipient: 'user@example.com',
        actor: makeActor({ role: 'CL_USER' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('rejects INSP with ForbiddenError', async () => {
    await expect(
      useCase.execute({
        recipient: 'user@example.com',
        actor: makeActor({ role: 'INSP' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('rejects empty recipient with ValidationError', async () => {
    await expect(
      useCase.execute({
        recipient: '   ',
        actor: makeActor(),
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('returns empty list when recipient has no records', async () => {
    vi.mocked(consentRepo.listByRecipient).mockResolvedValue([]);

    const result = await useCase.execute({
      recipient: 'never@seen.com',
      actor: makeActor(),
    });

    expect(result.entries).toEqual([]);
    expect(result.skippedCount).toBe(0);
  });

  it('passes channel filter to repository when provided', async () => {
    vi.mocked(consentRepo.listByRecipient).mockResolvedValue([]);

    await useCase.execute({
      recipient: 'user@example.com',
      channel: 'SMS',
      actor: makeActor(),
    });

    const call = vi.mocked(consentRepo.listByRecipient).mock.calls[0][0];
    expect(call.channel).toBe('SMS');
  });
});
