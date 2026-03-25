import { describe, expect, it, vi } from 'vitest';
import { FinishInspectionUseCase } from './finish-inspection.use-case';
import { ForbiddenError } from '../../../../shared/domain/errors';

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

    const useCase = new FinishInspectionUseCase(
      executionRepo as never,
      { findUploadedByExecutionId: vi.fn() } as never,
      { get: vi.fn().mockResolvedValue(null), set: vi.fn() } as never,
      { execute: vi.fn() } as never,
      { findById: vi.fn().mockResolvedValue({ appointment: { tenantId: 'tenant-1' } }) } as never,
      { log: vi.fn() } as never,
    );

    await expect(
      useCase.execute({
        appointmentId: 'apt-1',
        latitude: -12.97,
        longitude: -38.5,
        idempotencyKey: 'idem-1',
        actor: {
          userId: 'user-1',
          tenantId: 'tenant-1',
          branchId: null,
          role: 'INSP',
          inspectorId: 'insp-1',
        },
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
