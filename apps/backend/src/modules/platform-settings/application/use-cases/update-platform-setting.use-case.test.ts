import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UpdatePlatformSettingUseCase } from './update-platform-setting.use-case';
import { PlatformSettingUnknownKeyError } from '../../domain/platform-settings.errors';
import { ValidationError, ForbiddenError } from '../../../../shared/domain/errors';
import { AuthorizationService } from '../../../../shared/domain/authorization.service';

const VALID = {
  geofenceRadiusMeters: 150,
  geofenceMode: 'FLAG',
  checkInWindowToleranceMinutes: 15,
  completionReminderEnabled: true,
  completionReminderMinutesAfterWindowEnd: 30,
};
const DEFAULTS = {
  geofenceRadiusMeters: 300,
  geofenceMode: 'FLAG',
  checkInWindowToleranceMinutes: 15,
  completionReminderEnabled: true,
  completionReminderMinutesAfterWindowEnd: 30,
};

const repository = { findByKey: vi.fn(), findAll: vi.fn(), upsert: vi.fn() };
const auditService = { log: vi.fn() };
const settingsCache = { invalidate: vi.fn() };
const eventBus = { emit: vi.fn() };
const logger = { info: vi.fn(), error: vi.fn() };

const amActor = { userId: 'am-1', tenantId: null, role: 'AM' as const, branchId: null, inspectorId: null };
const opActor = { userId: 'op-1', tenantId: null, role: 'OP' as const, branchId: null, inspectorId: null };
const clActor = { userId: 'cl-1', tenantId: 'tenant-1', role: 'CL_ADMIN' as const, branchId: null, inspectorId: null };
const inspActor = { userId: 'i-1', tenantId: null, role: 'INSP' as const, branchId: null, inspectorId: 'insp-1' };

function makeSut(saveHooks = {}) {
  const auth = new AuthorizationService(auditService as never);
  return new UpdatePlatformSettingUseCase(
    repository as never,
    auth,
    auditService as never,
    settingsCache,
    eventBus as never,
    logger,
    saveHooks,
    () => new Date('2026-11-03T00:00:00.000Z'),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  repository.findByKey.mockResolvedValue(null);
  repository.upsert.mockImplementation(async (key: string, valueJson: unknown) => ({
    key,
    valueJson,
    updatedAt: new Date('2026-11-03T00:00:00.000Z'),
    updatedBy: { id: 'am-1', name: 'Admin' },
  }));
  eventBus.emit.mockResolvedValue(undefined);
});

describe('UpdatePlatformSettingUseCase', () => {
  it('allows AM and OP', async () => {
    await expect(makeSut().execute({ key: 'fieldEvents', value: VALID, actor: amActor })).resolves.toBeDefined();
    await expect(makeSut().execute({ key: 'fieldEvents', value: VALID, actor: opActor })).resolves.toBeDefined();
  });

  it('forbids CL_ADMIN and INSP and writes nothing', async () => {
    await expect(makeSut().execute({ key: 'fieldEvents', value: VALID, actor: clActor })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(makeSut().execute({ key: 'fieldEvents', value: VALID, actor: inspActor })).rejects.toBeInstanceOf(ForbiddenError);
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it('404s on an unknown key', async () => {
    await expect(makeSut().execute({ key: 'nope', value: VALID, actor: amActor })).rejects.toBeInstanceOf(PlatformSettingUnknownKeyError);
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it('400s on an invalid value with Zod details', async () => {
    let err: unknown;
    try {
      await makeSut().execute({ key: 'fieldEvents', value: { ...VALID, geofenceRadiusMeters: 10 }, actor: amActor });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).details).toBeDefined();
    expect(repository.upsert).not.toHaveBeenCalled();
  });

  it('upserts with the actor, audits with tenantId null and before=defaults, invalidates and emits once', async () => {
    const result = await makeSut().execute({ key: 'fieldEvents', value: VALID, actor: amActor });

    expect(repository.upsert).toHaveBeenCalledWith('fieldEvents', VALID, 'am-1');
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'platform_setting.updated',
        actorType: 'USER',
        actorId: 'am-1',
        entityType: 'PlatformSetting',
        entityId: 'fieldEvents',
        tenantId: null,
        before: DEFAULTS,
        after: VALID,
        metadata: { actor_tenant_id: null },
      }),
    );
    expect(settingsCache.invalidate).toHaveBeenCalledWith('fieldEvents');
    expect(eventBus.emit).toHaveBeenCalledTimes(1);
    expect(eventBus.emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'platform_setting.updated.v1',
        payload: expect.objectContaining({ key: 'fieldEvents', before: DEFAULTS, after: VALID, actorId: 'am-1' }),
      }),
    );
    expect(result.isDefault).toBe(false);
  });

  it('records actor_tenant_id for an OP acting with a selected tenant', async () => {
    await makeSut().execute({ key: 'fieldEvents', value: VALID, actor: { ...opActor, tenantId: 'tenant-9' } });
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { actor_tenant_id: 'tenant-9' } }),
    );
  });

  it('writes and audits even when saving the same value (no diff-skip)', async () => {
    repository.findByKey.mockResolvedValue({ key: 'fieldEvents', valueJson: VALID, updatedAt: new Date(), updatedBy: null });
    await makeSut().execute({ key: 'fieldEvents', value: VALID, actor: amActor });
    expect(repository.upsert).toHaveBeenCalledTimes(1);
    expect(auditService.log).toHaveBeenCalled();
  });

  it('still returns 200 and logs when a subscriber (emit) fails', async () => {
    eventBus.emit.mockRejectedValue(new Error('subscriber boom'));
    await expect(makeSut().execute({ key: 'fieldEvents', value: VALID, actor: amActor })).resolves.toBeDefined();
    expect(logger.error).toHaveBeenCalled();
  });

  it('emits no event when the upsert fails', async () => {
    repository.upsert.mockRejectedValue(new Error('db down'));
    await expect(makeSut().execute({ key: 'fieldEvents', value: VALID, actor: amActor })).rejects.toThrow();
    expect(eventBus.emit).not.toHaveBeenCalled();
  });

  describe('save hooks (D30)', () => {
    const hook = { fieldEvents: (_prev: unknown, next: Record<string, unknown>) => ({ ...next, geofenceRadiusMeters: 400 }) };

    it('stores/audits/emits the hook-transformed value', async () => {
      await makeSut(hook).execute({ key: 'fieldEvents', value: VALID, actor: amActor });
      expect(repository.upsert).toHaveBeenCalledWith('fieldEvents', { ...VALID, geofenceRadiusMeters: 400 }, 'am-1');
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({ after: { ...VALID, geofenceRadiusMeters: 400 } }),
      );
      expect(eventBus.emit).toHaveBeenCalledWith(
        expect.objectContaining({ payload: expect.objectContaining({ after: { ...VALID, geofenceRadiusMeters: 400 } }) }),
      );
    });

    it('does not call the hook for an invalid value', async () => {
      const spy = vi.fn((_p, n) => n);
      await expect(
        makeSut({ fieldEvents: spy }).execute({ key: 'fieldEvents', value: { ...VALID, geofenceRadiusMeters: 1 }, actor: amActor }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(spy).not.toHaveBeenCalled();
    });

    it('a throwing hook writes nothing, audits nothing, emits nothing', async () => {
      const throwing = { fieldEvents: () => { throw new Error('hook boom'); } };
      await expect(makeSut(throwing).execute({ key: 'fieldEvents', value: VALID, actor: amActor })).rejects.toThrow('hook boom');
      expect(repository.upsert).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
      expect(eventBus.emit).not.toHaveBeenCalled();
    });
  });
});
