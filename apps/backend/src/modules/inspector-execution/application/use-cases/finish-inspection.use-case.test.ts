import { describe, expect, it, vi } from 'vitest';
import { FinishInspectionUseCase } from './finish-inspection.use-case';
import { ForbiddenError } from '../../../../shared/domain/errors';
import { AuthorizationService } from '../../../../shared/domain/authorization.service';
import { ExecutionEmptyChecklistError } from '../../domain/inspection-execution.errors';

const INSP_ACTOR = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  branchId: null,
  role: 'INSP' as const,
  inspectorId: 'insp-1',
};

function buildUseCase(overrides: {
  executionRepo?: Record<string, unknown>;
  appointmentRepo?: Record<string, unknown>;
} = {}) {
  const executionRepo = overrides.executionRepo ?? {
    findByAppointmentId: vi.fn().mockResolvedValue({
      id: 'exec-1',
      appointmentId: 'apt-1',
      inspectorId: 'insp-1',
      startedAt: new Date('2026-03-23T10:00:00.000Z'),
      isFinished: () => false,
    }),
    update: vi.fn(),
  };
  const appointmentRepo = overrides.appointmentRepo ?? {
    findById: vi.fn().mockResolvedValue({
      appointment: { tenantId: 'tenant-1', serviceTypeId: null },
    }),
  };

  const auditService = { log: vi.fn() } as never;
  return new FinishInspectionUseCase(
    executionRepo as never,
    { get: vi.fn().mockResolvedValue(null), set: vi.fn() } as never,
    { execute: vi.fn().mockResolvedValue({ status: 'DONE' }) } as never,
    appointmentRepo as never,
    auditService,
    new AuthorizationService(auditService),
  );
}

describe('FinishInspectionUseCase', () => {
  it('rejects finishing an execution assigned to another inspector', async () => {
    const executionRepo = {
      findByAppointmentId: vi.fn().mockResolvedValue({
        id: 'exec-1',
        appointmentId: 'apt-1',
        inspectorId: 'insp-2',
        startedAt: new Date('2026-03-23T10:00:00.000Z'),
        isFinished: () => false,
      }),
    };

    const auditService = { log: vi.fn() } as never;
    const useCase = new FinishInspectionUseCase(
      executionRepo as never,
      { get: vi.fn().mockResolvedValue(null), set: vi.fn() } as never,
      { execute: vi.fn() } as never,
      { findById: vi.fn().mockResolvedValue({ appointment: { tenantId: 'tenant-1' } }) } as never,
      auditService,
      new AuthorizationService(auditService),
    );

    await expect(
      useCase.execute({
        appointmentId: 'apt-1',
        latitude: -12.97,
        longitude: -38.5,
        idempotencyKey: 'idem-1',
        actor: INSP_ACTOR,
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('rejects empty checklist when checklistJson is provided', async () => {
    const useCase = buildUseCase();

    await expect(
      useCase.execute({
        appointmentId: 'apt-1',
        latitude: -12.97,
        longitude: -38.5,
        checklistJson: {},
        idempotencyKey: 'idem-2',
        actor: INSP_ACTOR,
      }),
    ).rejects.toBeInstanceOf(ExecutionEmptyChecklistError);
  });

  it('allows undefined checklistJson (no checklist required)', async () => {
    const useCase = buildUseCase();

    const result = await useCase.execute({
      appointmentId: 'apt-1',
      latitude: -12.97,
      longitude: -38.5,
      idempotencyKey: 'idem-3',
      actor: INSP_ACTOR,
    });

    expect(result.executionId).toBe('exec-1');
    expect(result.appointmentStatus).toBe('DONE');
  });

  it('allows checklistJson with at least one response', async () => {
    const useCase = buildUseCase();

    const result = await useCase.execute({
      appointmentId: 'apt-1',
      latitude: -12.97,
      longitude: -38.5,
      checklistJson: { 'item-1': { value: true } },
      idempotencyKey: 'idem-4',
      actor: INSP_ACTOR,
    });

    expect(result.executionId).toBe('exec-1');
    expect(result.appointmentStatus).toBe('DONE');
  });
});
