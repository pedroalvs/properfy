import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OverrideConsentUseCase } from '../../../src/modules/notification/application/use-cases/override-consent.use-case';
import type { INotificationConsentRepository } from '../../../src/modules/notification/domain/notification-consent.repository';
import { NotificationConsentEntity } from '../../../src/modules/notification/domain/notification-consent.entity';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { ForbiddenError, ValidationError } from '../../../src/shared/domain/errors';
import { NotificationConsentNotFoundError } from '../../../src/modules/notification/domain/notification.errors';

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

describe('OverrideConsentUseCase', () => {
  let consentRepo: INotificationConsentRepository;
  let auditService: AuditService;
  let authorizationService: AuthorizationService;
  let useCase: OverrideConsentUseCase;

  beforeEach(() => {
    consentRepo = {
      findByRecipientChannelTenant: vi.fn(),
      findByScope: vi.fn(),
      listByRecipient: vi.fn(),
      countSkippedForRecipient: vi.fn(),
      findById: vi.fn(),
      upsert: vi.fn(),
    };
    auditService = { log: vi.fn() };
    authorizationService = new AuthorizationService(auditService);
    useCase = new OverrideConsentUseCase(consentRepo, authorizationService, auditService);
  });

  it('flips opted-out to opted-in with reason', async () => {
    vi.mocked(consentRepo.findById).mockResolvedValue(makeConsent());

    const result = await useCase.execute({
      consentId: 'consent-1',
      reason: 'Customer called to confirm consent',
      actor: makeActor(),
    });

    expect(result.optedOut).toBe(false);
    expect(result.changeSource).toBe('operator_override');
    expect(result.changedByUserId).toBe('user-1');
    expect(result.reason).toBe('Customer called to confirm consent');
    expect(consentRepo.upsert).toHaveBeenCalledTimes(1);
  });

  it('writes one audit record with consent.override_opted_in action', async () => {
    vi.mocked(consentRepo.findById).mockResolvedValue(makeConsent());

    await useCase.execute({
      consentId: 'consent-1',
      reason: 'Customer called to confirm consent',
      actor: makeActor(),
    });

    // Authorization passed (assertRoles doesn't audit on success), so only
    // the override audit should fire.
    const overrideCalls = vi.mocked(auditService.log).mock.calls.filter(
      (c) => c[0].action === 'consent.override_opted_in',
    );
    expect(overrideCalls).toHaveLength(1);
    const entry = overrideCalls[0][0];
    expect(entry.actorType).toBe('USER');
    expect(entry.actorId).toBe('user-1');
    expect(entry.entityType).toBe('NotificationConsent');
    expect(entry.entityId).toBe('consent-1');
    expect(entry.tenantId).toBe('tenant-1');
    expect(entry.reason).toBe('Customer called to confirm consent');
    expect(entry.before).toMatchObject({ optedOut: true });
    expect(entry.after).toMatchObject({ optedOut: false });
  });

  it('rejects missing reason with ValidationError', async () => {
    await expect(
      useCase.execute({
        consentId: 'consent-1',
        reason: '',
        actor: makeActor(),
      }),
    ).rejects.toThrow(ValidationError);
    expect(consentRepo.upsert).not.toHaveBeenCalled();
  });

  it('rejects whitespace-only reason', async () => {
    await expect(
      useCase.execute({
        consentId: 'consent-1',
        reason: '   ',
        actor: makeActor(),
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects reason longer than 1000 characters', async () => {
    await expect(
      useCase.execute({
        consentId: 'consent-1',
        reason: 'a'.repeat(1001),
        actor: makeActor(),
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects CL_ADMIN with ForbiddenError', async () => {
    await expect(
      useCase.execute({
        consentId: 'consent-1',
        reason: 'valid reason',
        actor: makeActor({ role: 'CL_ADMIN' }),
      }),
    ).rejects.toThrow(ForbiddenError);
    expect(consentRepo.findById).not.toHaveBeenCalled();
  });

  it('returns NotificationConsentNotFoundError when record does not exist', async () => {
    vi.mocked(consentRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        consentId: 'unknown-id',
        reason: 'test',
        actor: makeActor(),
      }),
    ).rejects.toThrow(NotificationConsentNotFoundError);
  });

  it('blocks OP from overriding another tenants consent', async () => {
    vi.mocked(consentRepo.findById).mockResolvedValue(
      makeConsent({ tenantId: 'tenant-other' }),
    );

    await expect(
      useCase.execute({
        consentId: 'consent-1',
        reason: 'test',
        actor: makeActor({ role: 'OP', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
    expect(consentRepo.upsert).not.toHaveBeenCalled();
  });

  it('allows AM to override any tenant', async () => {
    vi.mocked(consentRepo.findById).mockResolvedValue(
      makeConsent({ tenantId: 'tenant-other' }),
    );

    const result = await useCase.execute({
      consentId: 'consent-1',
      reason: 'AM override',
      actor: makeActor({ role: 'AM', tenantId: null }),
    });

    expect(result.optedOut).toBe(false);
    expect(result.reason).toBe('AM override');
  });
});
