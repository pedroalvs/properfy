import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdateTenantUseCase } from '../../../src/modules/tenant/application/use-cases/update-tenant.use-case';
import type { ITenantRepository } from '../../../src/modules/tenant/domain/tenant.repository';
import type { AuditService } from '../../../src/shared/infrastructure/audit';
import type { AuthContext } from '@properfy/shared';
import { TenantEntity } from '../../../src/modules/tenant/domain/tenant.entity';
import {
  TenantNotFoundError,
  TenantLegalNameConflictError,
  TenantAppointmentCodePrefixConflictError,
} from '../../../src/modules/tenant/domain/tenant.errors';
import { ForbiddenError, ValidationError } from '../../../src/shared/domain/errors';

function makeTenant(
  overrides: Partial<ConstructorParameters<typeof TenantEntity>[0]> = {},
): TenantEntity {
  return new TenantEntity({
    id: 'tenant-1',
    name: 'Test Agency',
    legalName: 'Test Agency Pty Ltd',
    status: 'ACTIVE',
    timezone: 'Australia/Sydney',
    currency: 'AUD',
    settingsJson: { theme: 'light', notifications: { email: true } },
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    ...overrides,
  });
}

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-am-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
    ...overrides,
  };
}

describe('UpdateTenantUseCase', () => {
  let tenantRepo: ITenantRepository;
  let auditService: AuditService;
  let useCase: UpdateTenantUseCase;

  beforeEach(() => {
    tenantRepo = {
      findById: vi.fn(),
      findByLegalName: vi.fn(),
      findByAppointmentCodePrefix: vi.fn().mockResolvedValue(null),
      findAll: vi.fn(),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
    };
    auditService = { log: vi.fn() } as unknown as AuditService;
    useCase = new UpdateTenantUseCase(tenantRepo, auditService);
  });

  it('should allow AM to update all fields', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(tenantRepo.findByLegalName).mockResolvedValue(null);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      data: {
        name: 'Updated Name',
        legalName: 'Updated Legal Name',
        timezone: 'America/Sao_Paulo',
        currency: 'BRL',
      },
      actor: makeActor(),
    });

    expect(result.name).toBe('Updated Name');
    expect(result.legalName).toBe('Updated Legal Name');
    expect(result.timezone).toBe('America/Sao_Paulo');
    expect(result.currency).toBe('BRL');
    expect(tenantRepo.update).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({
        name: 'Updated Name',
        legalName: 'Updated Legal Name',
        currency: 'BRL',
        timezone: 'America/Sao_Paulo',
      }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'tenant.updated' }),
    );
  });

  it('should allow CL_ADMIN to update own tenant (only name + settings)', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      data: {
        name: 'New Name',
        settings: { theme: 'dark' },
      },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.name).toBe('New Name');
  });

  it('should strip legalName/currency when CL_ADMIN updates', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());

    await useCase.execute({
      tenantId: 'tenant-1',
      data: {
        name: 'New Name',
        legalName: 'Hacked Legal Name',
        currency: 'FAKE',
      },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    // Verify update was NOT called with legalName or currency
    const updateCall = vi.mocked(tenantRepo.update).mock.calls[0]![1]!;
    expect(updateCall).not.toHaveProperty('legalName');
    expect(updateCall).not.toHaveProperty('currency');
  });

  it('should allow CL_ADMIN to update the agency timezone on their own tenant', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      data: { timezone: 'Australia/Perth' },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.timezone).toBe('Australia/Perth');
    expect(tenantRepo.update).toHaveBeenCalledWith(
      'tenant-1',
      expect.objectContaining({ timezone: 'Australia/Perth' }),
    );
    // The change is audited with before/after snapshots.
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'tenant.updated',
        before: expect.objectContaining({ timezone: 'Australia/Sydney' }),
        after: expect.objectContaining({ timezone: 'Australia/Perth' }),
      }),
    );
  });

  it('should reject an invalid timezone with a ValidationError', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        data: { timezone: 'Hacked/TZ' },
        actor: makeActor(),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(tenantRepo.update).not.toHaveBeenCalled();
  });

  it('should throw TENANT_LEGAL_NAME_CONFLICT when legalName is taken', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant());
    vi.mocked(tenantRepo.findByLegalName).mockResolvedValue(
      makeTenant({ id: 'tenant-other' }),
    );

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        data: { legalName: 'Taken Legal Name' },
        actor: makeActor(),
      }),
    ).rejects.toThrow(TenantLegalNameConflictError);
  });

  it('should deep merge settings', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(
      makeTenant({
        settingsJson: {
          theme: 'light',
          notifications: { email: true, sms: false },
        },
      }),
    );

    await useCase.execute({
      tenantId: 'tenant-1',
      data: {
        settings: { notifications: { sms: true } },
      },
      actor: makeActor(),
    });

    const updateCall = vi.mocked(tenantRepo.update).mock.calls[0]![1]!;
    expect(updateCall.settingsJson).toEqual({
      theme: 'light',
      notifications: { email: true, sms: true },
    });
  });

  it('dual-writes a cached old client notification setting on update', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(
      makeTenant({
        settingsJson: {
          theme: 'light',
          rentalTenantNotificationsEnabled: true,
          emailSendingEnabled: true,
        },
      }),
    );

    await useCase.execute({
      tenantId: 'tenant-1',
      data: { settings: { emailSendingEnabled: false } },
      actor: makeActor(),
    });

    const updateCall = vi.mocked(tenantRepo.update).mock.calls[0]![1]!;
    expect(updateCall.settingsJson).toEqual({
      theme: 'light',
      rentalTenantNotificationsEnabled: false,
      emailSendingEnabled: false,
    });
  });

  it('reactivates both keys from a cached old client update', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(
      makeTenant({
        settingsJson: {
          rentalTenantNotificationsEnabled: false,
          emailSendingEnabled: false,
        },
      }),
    );

    await useCase.execute({
      tenantId: 'tenant-1',
      data: { settings: { emailSendingEnabled: true } },
      actor: makeActor(),
    });

    const updateCall = vi.mocked(tenantRepo.update).mock.calls[0]![1]!;
    expect(updateCall.settingsJson).toEqual({
      rentalTenantNotificationsEnabled: true,
      emailSendingEnabled: true,
    });
  });

  it('fails closed and repairs conflicting notification settings on update', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(
      makeTenant({ settingsJson: { emailSendingEnabled: false } }),
    );

    await useCase.execute({
      tenantId: 'tenant-1',
      data: {
        settings: {
          rentalTenantNotificationsEnabled: true,
          emailSendingEnabled: false,
        },
      },
      actor: makeActor(),
    });

    const updateCall = vi.mocked(tenantRepo.update).mock.calls[0]![1]!;
    expect(updateCall.settingsJson).toEqual({
      rentalTenantNotificationsEnabled: false,
      emailSendingEnabled: false,
    });
  });

  it('should throw TENANT_NOT_FOUND when tenant does not exist', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(null);

    await expect(
      useCase.execute({
        tenantId: 'nonexistent',
        data: { name: 'New Name' },
        actor: makeActor(),
      }),
    ).rejects.toThrow(TenantNotFoundError);
  });

  it('should reject CL_ADMIN updating another tenant', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        data: { name: 'X' },
        actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-other' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should reject CL_USER', async () => {
    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        data: { name: 'X' },
        actor: makeActor({ role: 'CL_USER', tenantId: 'tenant-1' }),
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  // F00 removed the dead "should allow OP to update own tenant" and "should reject OP updating
  // another tenant" tests: OP's JWT never carries a tenantId, so the old
  // `(CL_ADMIN || OP) && actor.tenantId === tenantId` branch never fired. OP's real RBAC is
  // covered by the "OP mapWindowDays (F00)" block below (B1–B10).

  it('should filter settings keys for CL_ADMIN — only allow-listed keys pass through', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant({ settingsJson: {} }));

    await useCase.execute({
      tenantId: 'tenant-1',
      data: {
        settings: {
          logoUrl: 'https://example.com/logo.png',
          primaryColor: '#FF5733',
          notificationFromName: 'Agency',
          billingPeriod: 'WEEKLY',
          clUserPermissions: ['create_appointments'],
          allowClientCancellation: false,
          priorityOfferHours: 48,
        },
      },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    const updateCall = vi.mocked(tenantRepo.update).mock.calls[0]![1]!;
    const mergedSettings = updateCall.settingsJson as Record<string, unknown>;
    // logoUrl is blocked for all roles — must use dedicated upload flow
    expect(mergedSettings).not.toHaveProperty('logoUrl');
    // Other branding/notification keys allowed for CL_ADMIN
    expect(mergedSettings).toHaveProperty('primaryColor', '#FF5733');
    expect(mergedSettings).toHaveProperty('notificationFromName', 'Agency');
    // Blocked keys should NOT be present
    expect(mergedSettings).not.toHaveProperty('billingPeriod');
    expect(mergedSettings).not.toHaveProperty('clUserPermissions');
    expect(mergedSettings).not.toHaveProperty('allowClientCancellation');
    expect(mergedSettings).not.toHaveProperty('priorityOfferHours');
  });

  it('should throw ValidationError when AM tries to set logoUrl via PATCH', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant({ settingsJson: {} }));
    const { ValidationError } = await import('../../../src/shared/domain/errors');

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        data: { settings: { logoUrl: 'https://example.com/logo.png' } },
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('should throw ValidationError when AM tries to set logoStorageKey via PATCH', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant({ settingsJson: {} }));
    const { ValidationError } = await import('../../../src/shared/domain/errors');

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        data: { settings: { logoStorageKey: 'tenants/some-id/branding/logo.png' } },
        actor: makeActor({ role: 'AM' }),
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('should let CL_ADMIN update the top-level appointmentCodePrefix (not stripped)', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant({ appointmentCodePrefix: 'OLD' }));
    vi.mocked(tenantRepo.findByAppointmentCodePrefix).mockResolvedValue(null);

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      data: { appointmentCodePrefix: 'NEW' },
      actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
    });

    expect(result.appointmentCodePrefix).toBe('NEW');
    const updateCall = vi.mocked(tenantRepo.update).mock.calls[0]![1]!;
    expect(updateCall).toHaveProperty('appointmentCodePrefix', 'NEW');
  });

  it('uppercases the prefix for the uniqueness lookup and the update payload', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant({ appointmentCodePrefix: 'OLD' }));
    vi.mocked(tenantRepo.findByAppointmentCodePrefix).mockResolvedValue(null);

    await useCase.execute({
      tenantId: 'tenant-1',
      data: { appointmentCodePrefix: 'xyz' },
      actor: makeActor(),
    });

    expect(tenantRepo.findByAppointmentCodePrefix).toHaveBeenCalledWith('XYZ');
    const updateCall = vi.mocked(tenantRepo.update).mock.calls[0]![1]!;
    expect(updateCall).toHaveProperty('appointmentCodePrefix', 'XYZ');
  });

  it('should throw TENANT_PREFIX_CONFLICT when the new prefix belongs to another tenant', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant({ appointmentCodePrefix: 'OLD' }));
    vi.mocked(tenantRepo.findByAppointmentCodePrefix).mockResolvedValue(
      makeTenant({ id: 'tenant-other', appointmentCodePrefix: 'NEW' }),
    );

    await expect(
      useCase.execute({
        tenantId: 'tenant-1',
        data: { appointmentCodePrefix: 'NEW' },
        actor: makeActor(),
      }),
    ).rejects.toThrow(TenantAppointmentCodePrefixConflictError);
  });

  it('should NOT conflict when the prefix is unchanged (owned by the same tenant)', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant({ appointmentCodePrefix: 'SAME' }));
    vi.mocked(tenantRepo.findByAppointmentCodePrefix).mockResolvedValue(
      makeTenant({ id: 'tenant-1', appointmentCodePrefix: 'SAME' }),
    );

    const result = await useCase.execute({
      tenantId: 'tenant-1',
      data: { appointmentCodePrefix: 'SAME', name: 'Renamed' },
      actor: makeActor(),
    });

    expect(result.name).toBe('Renamed');
    // Unchanged prefix → no uniqueness lookup needed
    expect(tenantRepo.findByAppointmentCodePrefix).not.toHaveBeenCalled();
  });

  it('should record appointmentCodePrefix in the audit before/after', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant({ appointmentCodePrefix: 'OLD' }));
    vi.mocked(tenantRepo.findByAppointmentCodePrefix).mockResolvedValue(null);

    await useCase.execute({
      tenantId: 'tenant-1',
      data: { appointmentCodePrefix: 'NEW' },
      actor: makeActor(),
    });

    const logArg = vi.mocked(auditService.log).mock.calls[0]![0] as {
      before: Record<string, unknown>;
      after: Record<string, unknown>;
    };
    expect(logArg.before.appointmentCodePrefix).toBe('OLD');
    expect(logArg.after.appointmentCodePrefix).toBe('NEW');
  });

  it('should NOT filter settings keys for AM — all keys pass through', async () => {
    vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant({ settingsJson: {} }));

    await useCase.execute({
      tenantId: 'tenant-1',
      data: {
        settings: {
          billingPeriod: 'WEEKLY',
          clUserPermissions: ['create_appointments'],
          allowClientCancellation: false,
        },
      },
      actor: makeActor(),
    });

    const updateCall = vi.mocked(tenantRepo.update).mock.calls[0]![1]!;
    const mergedSettings = updateCall.settingsJson as Record<string, unknown>;
    expect(mergedSettings).toHaveProperty('billingPeriod', 'WEEKLY');
    expect(mergedSettings).toHaveProperty('clUserPermissions');
    expect(mergedSettings).toHaveProperty('allowClientCancellation', false);
  });

  describe('OP mapWindowDays (F00)', () => {
    const OP = (tenantId: string | null = null) => makeActor({ role: 'OP', userId: 'user-op-1', tenantId });

    beforeEach(() => {
      vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant({ settingsJson: { primaryColor: '#000000' } }));
    });

    it('B1: OP writes mapWindowDays on tenant-1 (JWT tenantId null) → update + audit', async () => {
      await useCase.execute({ tenantId: 'tenant-1', data: { settings: { mapWindowDays: 30 } }, actor: OP(null) });
      expect(tenantRepo.update).toHaveBeenCalledWith('tenant-1', {
        settingsJson: { primaryColor: '#000000', mapWindowDays: 30 },
      });
      const audit = vi.mocked(auditService.log).mock.calls[0]![0];
      expect(audit).toMatchObject({ action: 'tenant.updated', entityId: 'tenant-1' });
      expect((audit.before as { settingsJson: Record<string, unknown> }).settingsJson.mapWindowDays).toBeUndefined();
      expect((audit.after as { settingsJson: Record<string, unknown> }).settingsJson.mapWindowDays).toBe(30);
    });

    it('B2: OP with a JWT tenantId still writes any agency (field ignored)', async () => {
      await useCase.execute({ tenantId: 'tenant-1', data: { settings: { mapWindowDays: 30 } }, actor: OP('tenant-other') });
      expect(tenantRepo.update).toHaveBeenCalledWith('tenant-1', {
        settingsJson: { primaryColor: '#000000', mapWindowDays: 30 },
      });
    });

    it('B3: OP sending name → Forbidden, nothing written', async () => {
      await expect(useCase.execute({ tenantId: 'tenant-1', data: { name: 'X' }, actor: OP() })).rejects.toThrow(ForbiddenError);
      expect(tenantRepo.update).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('B4: OP name + mapWindowDays → Forbidden', async () => {
      await expect(useCase.execute({ tenantId: 'tenant-1', data: { name: 'X', settings: { mapWindowDays: 30 } }, actor: OP() })).rejects.toThrow(ForbiddenError);
      expect(tenantRepo.update).not.toHaveBeenCalled();
    });

    it('B5: OP mapWindowDays + another settings key → Forbidden', async () => {
      await expect(useCase.execute({ tenantId: 'tenant-1', data: { settings: { mapWindowDays: 30, primaryColor: '#111111' } }, actor: OP() })).rejects.toThrow(ForbiddenError);
      expect(tenantRepo.update).not.toHaveBeenCalled();
    });

    it('B6: OP logoUrl → Forbidden (not ValidationError)', async () => {
      await expect(useCase.execute({ tenantId: 'tenant-1', data: { settings: { logoUrl: 'https://x' } }, actor: OP() })).rejects.toThrow(ForbiddenError);
    });

    it('B7: OP empty settings and empty body → Forbidden', async () => {
      await expect(useCase.execute({ tenantId: 'tenant-1', data: { settings: {} }, actor: OP() })).rejects.toThrow(ForbiddenError);
      await expect(useCase.execute({ tenantId: 'tenant-1', data: {}, actor: OP() })).rejects.toThrow(ForbiddenError);
    });

    it('B8: OP any top-level field → Forbidden', async () => {
      for (const data of [{ timezone: 'Australia/Perth' }, { appointmentCodePrefix: 'ABC' }, { legalName: 'Y' }, { currency: 'USD' }]) {
        await expect(useCase.execute({ tenantId: 'tenant-1', data, actor: OP() })).rejects.toThrow(ForbiddenError);
      }
    });

    it('B9: OP out-of-range mapWindowDays → ValidationError on settings.mapWindowDays', async () => {
      await expect(
        useCase.execute({ tenantId: 'tenant-1', data: { settings: { mapWindowDays: 0 } }, actor: OP() }),
      ).rejects.toThrow(ValidationError);
      const err = await useCase
        .execute({ tenantId: 'tenant-1', data: { settings: { mapWindowDays: 0 } }, actor: OP() })
        .catch((e) => e as ValidationError);
      expect(err.details?.[0]?.field).toBe('settings.mapWindowDays');
    });

    it('B10: OP on a missing target → TenantNotFoundError', async () => {
      vi.mocked(tenantRepo.findById).mockResolvedValue(null);
      await expect(useCase.execute({ tenantId: 'gone', data: { settings: { mapWindowDays: 30 } }, actor: OP() })).rejects.toThrow(TenantNotFoundError);
    });

    it('B12: AM writes mapWindowDays → update + audit before/after', async () => {
      await useCase.execute({ tenantId: 'tenant-1', data: { settings: { mapWindowDays: 30 } }, actor: makeActor() });
      const audit = vi.mocked(auditService.log).mock.calls[0]![0];
      expect((audit.after as { settingsJson: Record<string, unknown> }).settingsJson.mapWindowDays).toBe(30);
    });

    it('B13: CL_ADMIN own mapWindowDays → 200, silently discarded (no update/log)', async () => {
      const result = await useCase.execute({ tenantId: 'tenant-1', data: { settings: { mapWindowDays: 30 } }, actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }) });
      expect(tenantRepo.update).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
      expect(result.settingsJson.mapWindowDays).toBeUndefined();
    });

    it('B14: CL_ADMIN own mapWindowDays + allowed key → writes allowed key only', async () => {
      await useCase.execute({ tenantId: 'tenant-1', data: { settings: { mapWindowDays: 30, primaryColor: '#111111' } }, actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }) });
      const updateCall = vi.mocked(tenantRepo.update).mock.calls[0]![1]!;
      const merged = updateCall.settingsJson as Record<string, unknown>;
      expect(merged.primaryColor).toBe('#111111');
      expect(merged.mapWindowDays).toBeUndefined();
    });

    it('B15: CL_ADMIN other agency / CL_USER with mapWindowDays → Forbidden', async () => {
      await expect(useCase.execute({ tenantId: 'tenant-1', data: { settings: { mapWindowDays: 30 } }, actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-other' }) })).rejects.toThrow(ForbiddenError);
      await expect(useCase.execute({ tenantId: 'tenant-1', data: { settings: { mapWindowDays: 30 } }, actor: makeActor({ role: 'CL_USER', tenantId: 'tenant-1' }) })).rejects.toThrow(ForbiddenError);
    });
  });

  describe('empty-PATCH guard (F00)', () => {
    let emit: ReturnType<typeof vi.fn>;
    let guardedUseCase: UpdateTenantUseCase;

    beforeEach(() => {
      emit = vi.fn();
      guardedUseCase = new UpdateTenantUseCase(tenantRepo, auditService, { emit } as never);
      vi.mocked(tenantRepo.findById).mockResolvedValue(makeTenant({ settingsJson: { primaryColor: '#000000' } }));
    });

    const expectNoop = () => {
      expect(tenantRepo.update).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
      expect(emit).not.toHaveBeenCalled();
    };

    it('N1: CL_ADMIN own, only a discarded key → no update/log/event, returns current', async () => {
      const result = await guardedUseCase.execute({ tenantId: 'tenant-1', data: { settings: { mapWindowDays: 30 } }, actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }) });
      expectNoop();
      expect(result.settingsJson.mapWindowDays).toBeUndefined();
    });

    it('N2: CL_ADMIN own, a key outside the allow-list → no-op', async () => {
      await guardedUseCase.execute({ tenantId: 'tenant-1', data: { settings: { billingPeriod: 'WEEKLY' } }, actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }) });
      expectNoop();
    });

    it('N3: AM empty body → no-op', async () => {
      await guardedUseCase.execute({ tenantId: 'tenant-1', data: {}, actor: makeActor() });
      expectNoop();
    });

    it('N4: AM empty settings → no-op', async () => {
      await guardedUseCase.execute({ tenantId: 'tenant-1', data: { settings: {} }, actor: makeActor() });
      expectNoop();
    });

    it('N5: CL_ADMIN own primaryColor → update + audit + event', async () => {
      await guardedUseCase.execute({ tenantId: 'tenant-1', data: { settings: { primaryColor: '#111111' } }, actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }) });
      expect(tenantRepo.update).toHaveBeenCalled();
      const audit = vi.mocked(auditService.log).mock.calls[0]![0];
      expect((audit.before as { settingsJson: Record<string, unknown> }).settingsJson.primaryColor).toBe('#000000');
      expect((audit.after as { settingsJson: Record<string, unknown> }).settingsJson.primaryColor).toBe('#111111');
      expect(emit).toHaveBeenCalled();
    });

    it('N6: AM name → update + audit + event', async () => {
      await guardedUseCase.execute({ tenantId: 'tenant-1', data: { name: 'Novo' }, actor: makeActor() });
      expect(tenantRepo.update).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalled();
      expect(emit).toHaveBeenCalled();
    });

    it('N7: CL_ADMIN own name + discarded mapWindowDays → updates name only, after has no mapWindowDays', async () => {
      await guardedUseCase.execute({ tenantId: 'tenant-1', data: { name: 'Novo', settings: { mapWindowDays: 30 } }, actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }) });
      const updateCall = vi.mocked(tenantRepo.update).mock.calls[0]![1]!;
      expect(updateCall.name).toBe('Novo');
      expect(updateCall.settingsJson).toBeUndefined();
      const audit = vi.mocked(auditService.log).mock.calls[0]![0];
      expect((audit.after as { settingsJson: Record<string, unknown> }).settingsJson.mapWindowDays).toBeUndefined();
    });

    it('N8: AM empty body on a missing target → TenantNotFoundError (guard runs after findById)', async () => {
      vi.mocked(tenantRepo.findById).mockResolvedValue(null);
      await expect(guardedUseCase.execute({ tenantId: 'gone', data: {}, actor: makeActor() })).rejects.toThrow(TenantNotFoundError);
    });
  });
});
