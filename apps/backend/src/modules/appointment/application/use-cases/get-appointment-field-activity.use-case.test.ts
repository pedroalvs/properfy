import { describe, it, expect, vi } from 'vitest';
import { GetAppointmentFieldActivityUseCase } from './get-appointment-field-activity.use-case';
import { ForbiddenError } from '../../../../shared/domain/errors';
import { AuthorizationService } from '../../../../shared/domain/authorization.service';

const actor = (role: string, tenantId = 'tenant-1', inspectorId: string | null = null) => ({
  userId: 'u1',
  tenantId,
  branchId: null,
  role: role as never,
  inspectorId,
});

function build(opts: { execution?: unknown; records?: unknown[]; found?: unknown } = {}) {
  const appointmentRepo = {
    findById: vi.fn().mockResolvedValue(
      opts.found ?? { appointment: { tenantId: 'tenant-1', isDeleted: () => false } },
    ),
  };
  const executionRepo = {
    findByAppointmentId: vi.fn().mockResolvedValue(opts.execution ?? null),
  };
  const fieldEventRepo = {
    listByAppointmentId: vi.fn().mockResolvedValue(opts.records ?? []),
  };
  const inspectorRepo = { findById: vi.fn().mockResolvedValue({ name: 'Jane Doe' }) };
  const auditService = { log: vi.fn() };
  const useCase = new GetAppointmentFieldActivityUseCase(
    appointmentRepo as never,
    executionRepo as never,
    fieldEventRepo as never,
    inspectorRepo as never,
    new AuthorizationService(auditService as never),
  );
  return { useCase, appointmentRepo, executionRepo, fieldEventRepo, inspectorRepo };
}

const fullExecution = {
  id: 'exec-1',
  inspectorId: 'insp-1',
  startedAt: new Date('2026-11-03T22:00:00.000Z'),
  finishedAt: new Date('2026-11-03T23:00:00.000Z'),
  abandonedAt: null,
  startClientAt: null,
  finishClientAt: null,
  geolocationDistanceMeters: 120,
  finishGeolocationDistanceMeters: 80,
  startAccuracyMeters: 10,
  finishAccuracyMeters: 12,
  outOfRadius: false,
  outOfWindow: false,
  finishOutOfRadius: false,
  geofenceRadiusMeters: 300,
  startLatitude: -33.86,
  startLongitude: 151.2,
  finishLatitude: -33.861,
  finishLongitude: 151.21,
};

const cantDoRecord = {
  id: 'e1',
  type: 'CANT_DO',
  reasonCode: 'KEY_FAILED',
  note: 'Lockbox code wrong',
  minutes: null,
  inspectorName: 'Jane Doe',
  latitude: -33.86,
  longitude: 151.2,
  accuracyMeters: 8,
  clientOccurredAt: null,
  occurredAt: new Date('2026-11-03T22:30:00.000Z'),
};

describe('GetAppointmentFieldActivityUseCase', () => {
  it('returns raw coordinates for AM', async () => {
    const ctx = build({ execution: fullExecution, records: [cantDoRecord] });
    const result = await ctx.useCase.execute({ appointmentId: 'apt-1', actor: actor('AM') });

    expect(ctx.appointmentRepo.findById).toHaveBeenCalledWith('apt-1', null);
    expect(result.execution).toMatchObject({
      startLatitude: -33.86,
      startLongitude: 151.2,
      finishLatitude: -33.861,
      startDistanceMeters: 120,
      finishDistanceMeters: 80,
    });
    expect(result.events[0]).toMatchObject({ reason: 'KEY_FAILED', latitude: -33.86, longitude: 151.2 });
    expect(ctx.fieldEventRepo.listByAppointmentId).toHaveBeenCalledWith('apt-1', 50);
  });

  it('returns raw coordinates for OP', async () => {
    const ctx = build({ execution: fullExecution, records: [cantDoRecord] });
    const result = await ctx.useCase.execute({ appointmentId: 'apt-1', actor: actor('OP') });
    expect(result.execution).toHaveProperty('startLatitude');
  });

  it('omits every coordinate for CL_ADMIN of the tenant', async () => {
    const ctx = build({ execution: fullExecution, records: [cantDoRecord] });
    const result = await ctx.useCase.execute({ appointmentId: 'apt-1', actor: actor('CL_ADMIN') });

    // scoped query by tenant
    expect(ctx.appointmentRepo.findById).toHaveBeenCalledWith('apt-1', 'tenant-1');
    // Derived values stay; raw coordinates are gone entirely.
    expect(result.execution).toMatchObject({ startDistanceMeters: 120, outOfRadius: false });
    expect(result.execution).not.toHaveProperty('startLatitude');
    expect(result.execution).not.toHaveProperty('finishLongitude');
    expect(result.events[0]).not.toHaveProperty('latitude');
    expect(result.events[0]).not.toHaveProperty('longitude');
    // Serializing the result must carry no coordinate number anywhere.
    expect(JSON.stringify(result)).not.toContain('151.2');
  });

  it('omits every coordinate for CL_USER of the tenant', async () => {
    const ctx = build({ execution: fullExecution, records: [cantDoRecord] });
    const result = await ctx.useCase.execute({ appointmentId: 'apt-1', actor: actor('CL_USER') });
    expect(result.execution).not.toHaveProperty('startLatitude');
  });

  it('returns 404 for a CL actor of another tenant (scoped query finds nothing)', async () => {
    const ctx = build({ found: null });
    await expect(
      ctx.useCase.execute({ appointmentId: 'apt-1', actor: actor('CL_ADMIN', 'tenant-2') }),
    ).rejects.toMatchObject({ code: 'APPOINTMENT_NOT_FOUND' });
  });

  it('returns 404 when a cross-tenant row leaks through the scope check', async () => {
    const ctx = build({ found: { appointment: { tenantId: 'tenant-9', isDeleted: () => false } } });
    await expect(
      ctx.useCase.execute({ appointmentId: 'apt-1', actor: actor('CL_ADMIN', 'tenant-1') }),
    ).rejects.toMatchObject({ code: 'APPOINTMENT_NOT_FOUND' });
  });

  it('forbids an inspector (403)', async () => {
    const ctx = build();
    await expect(
      ctx.useCase.execute({ appointmentId: 'apt-1', actor: actor('INSP', 'tenant-1', 'insp-1') }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('returns a null execution when none exists', async () => {
    const ctx = build({ execution: null });
    const result = await ctx.useCase.execute({ appointmentId: 'apt-1', actor: actor('OP') });
    expect(result.execution).toBeNull();
  });

  it('surfaces an abandoned execution with abandonedAt set', async () => {
    const ctx = build({
      execution: { ...fullExecution, finishedAt: null, abandonedAt: new Date('2026-11-03T22:40:00.000Z') },
    });
    const result = await ctx.useCase.execute({ appointmentId: 'apt-1', actor: actor('OP') });
    expect(result.execution?.abandonedAt).toBe('2026-11-03T22:40:00.000Z');
    expect(result.execution?.finishedAt).toBeNull();
  });
});
