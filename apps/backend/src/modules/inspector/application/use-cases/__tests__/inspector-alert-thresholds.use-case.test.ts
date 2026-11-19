import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AuthContext, UserRole } from '@properfy/shared';
import { GetInspectorAlertThresholdsUseCase } from '../get-inspector-alert-thresholds.use-case';
import { UpdateInspectorAlertThresholdsUseCase } from '../update-inspector-alert-thresholds.use-case';
import { ForbiddenError } from '../../../../../shared/domain/errors';
import { InspectorNotFoundError } from '../../../domain/inspector.errors';

function actor(role: UserRole = 'AM'): AuthContext {
  return { userId: 'u-1', tenantId: null, role, branchId: null, inspectorId: null };
}

const PLATFORM = { delayMinutes: 20, notStartedMinutes: 30 };

function makeDeps(opts: { exists?: boolean; stored?: unknown } = {}) {
  const exists = opts.exists ?? true;
  const inspectorRepo = {
    findById: vi.fn().mockResolvedValue(exists ? { id: 'insp-1' } : null),
    getAlertOverrides: vi.fn().mockResolvedValue(opts.stored ?? null),
    setAlertOverrides: vi.fn().mockResolvedValue(true),
  };
  const platformSettings = { get: vi.fn().mockResolvedValue({ ...PLATFORM }) };
  const authorizationService = {
    assertRoles: vi.fn((a: AuthContext, roles: readonly string[]) => {
      if (!roles.includes(a.role)) throw new ForbiddenError('AUTH_FORBIDDEN', 'no');
    }),
  };
  const auditService = { log: vi.fn() };
  return { inspectorRepo, platformSettings, authorizationService, auditService };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const getUC = (d: ReturnType<typeof makeDeps>) =>
  new GetInspectorAlertThresholdsUseCase(d.inspectorRepo as any, d.platformSettings as any, d.authorizationService as any);
const putUC = (d: ReturnType<typeof makeDeps>) =>
  new UpdateInspectorAlertThresholdsUseCase(
    d.inspectorRepo as any,
    d.platformSettings as any,
    d.authorizationService as any,
    d.auditService as any,
  );
/* eslint-enable @typescript-eslint/no-explicit-any */

describe('GetInspectorAlertThresholdsUseCase (test 12)', () => {
  it('rejects non AM/OP before the lookup', async () => {
    const d = makeDeps();
    await expect(getUC(d).execute({ inspectorId: 'insp-1', actor: actor('CL_ADMIN') })).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(d.inspectorRepo.findById).not.toHaveBeenCalled();
  });

  it('404s a missing inspector', async () => {
    await expect(getUC(makeDeps({ exists: false })).execute({ inspectorId: 'x', actor: actor() })).rejects.toBeInstanceOf(
      InspectorNotFoundError,
    );
  });

  it('returns platform defaults + null override + effective when unset', async () => {
    const res = await getUC(makeDeps({ stored: null })).execute({ inspectorId: 'insp-1', actor: actor('OP') });
    expect(res).toEqual({
      inspectorId: 'insp-1',
      platformDefaults: { delayMinutes: 20, notStartedMinutes: 30 },
      override: { delayMinutes: null, notStartedMinutes: null },
      effective: { delayMinutes: 20, notStartedMinutes: 30 },
    });
  });

  it('applies a stored override to the effective values', async () => {
    const res = await getUC(makeDeps({ stored: { delayMinutes: 45, notStartedMinutes: null } })).execute({
      inspectorId: 'insp-1',
      actor: actor(),
    });
    expect(res.override).toEqual({ delayMinutes: 45, notStartedMinutes: null });
    expect(res.effective).toEqual({ delayMinutes: 45, notStartedMinutes: 30 });
  });
});

describe('UpdateInspectorAlertThresholdsUseCase (test 12)', () => {
  let d: ReturnType<typeof makeDeps>;
  beforeEach(() => {
    d = makeDeps({ stored: null });
  });

  it('rejects non AM/OP', async () => {
    await expect(
      putUC(d).execute({ inspectorId: 'insp-1', actor: actor('INSP'), input: { delayMinutes: 25, notStartedMinutes: 40 } }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('writes a new override and audits with tenantId null', async () => {
    const res = await putUC(d).execute({
      inspectorId: 'insp-1',
      actor: actor('AM'),
      input: { delayMinutes: 25, notStartedMinutes: 40 },
    });
    expect(d.inspectorRepo.setAlertOverrides).toHaveBeenCalledWith('insp-1', { delayMinutes: 25, notStartedMinutes: 40 });
    expect(d.auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'inspector.alert_thresholds_updated', tenantId: null, entityId: 'insp-1' }),
    );
    expect(res.override).toEqual({ delayMinutes: 25, notStartedMinutes: 40 });
    expect(res.effective).toEqual({ delayMinutes: 25, notStartedMinutes: 40 });
  });

  it('both-null clears the override (stored as DB NULL)', async () => {
    await putUC(d).execute({ inspectorId: 'insp-1', actor: actor(), input: { delayMinutes: null, notStartedMinutes: null } });
    // current stored was null, new is null → no change → no write, no audit.
    expect(d.inspectorRepo.setAlertOverrides).not.toHaveBeenCalled();
    expect(d.auditService.log).not.toHaveBeenCalled();
  });

  it('clearing an existing override stores null and audits', async () => {
    const withStored = makeDeps({ stored: { delayMinutes: 25, notStartedMinutes: 40 } });
    await putUC(withStored).execute({
      inspectorId: 'insp-1',
      actor: actor(),
      input: { delayMinutes: null, notStartedMinutes: null },
    });
    expect(withStored.inspectorRepo.setAlertOverrides).toHaveBeenCalledWith('insp-1', null);
    expect(withStored.auditService.log).toHaveBeenCalled();
  });

  it('a write equal to the stored value is a no-op (idempotent, no audit)', async () => {
    const same = makeDeps({ stored: { delayMinutes: 25, notStartedMinutes: 40 } });
    await putUC(same).execute({
      inspectorId: 'insp-1',
      actor: actor(),
      input: { delayMinutes: 25, notStartedMinutes: 40 },
    });
    expect(same.inspectorRepo.setAlertOverrides).not.toHaveBeenCalled();
    expect(same.auditService.log).not.toHaveBeenCalled();
  });

  it('404s a missing inspector', async () => {
    await expect(
      putUC(makeDeps({ exists: false })).execute({
        inspectorId: 'x',
        actor: actor(),
        input: { delayMinutes: 25, notStartedMinutes: 40 },
      }),
    ).rejects.toBeInstanceOf(InspectorNotFoundError);
  });
});
