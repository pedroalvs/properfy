import { describe, expect, it, vi } from 'vitest';
import { RequestAssetUploadUseCase } from './request-asset-upload.use-case';
import { ForbiddenError } from '../../../../shared/domain/errors';
import { AuthorizationService } from '../../../../shared/domain/authorization.service';
import {
  ExecutionAppointmentNotFoundError,
} from '../../domain/inspection-execution.errors';

const VALID_ACTOR = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  branchId: null,
  role: 'INSP' as const,
  inspectorId: 'insp-1',
};

const VALID_INPUT = {
  appointmentId: 'apt-1',
  kind: 'PHOTO' as const,
  mimeType: 'image/jpeg',
  fileName: 'photo.jpg',
  actor: VALID_ACTOR,
};

function makeExecution(overrides: Record<string, unknown> = {}) {
  return {
    id: 'exec-1',
    inspectorId: 'insp-1',
    isFinished: () => false,
    ...overrides,
  };
}

function makeAppointmentResult(overrides: Record<string, unknown> = {}) {
  return {
    appointment: {
      id: 'apt-1',
      tenantId: 'tenant-1',
      inspectorId: 'insp-1',
      ...overrides,
    },
    contact: null,
    restrictions: [],
  };
}

describe('RequestAssetUploadUseCase', () => {
  it('rejects uploads for executions assigned to another inspector', async () => {
    const executionRepo = {
      findByAppointmentId: vi.fn().mockResolvedValue(makeExecution({ inspectorId: 'insp-2' })),
    };
    const authSvc = new AuthorizationService({ log: vi.fn() } as never);

    const useCase = new RequestAssetUploadUseCase(
      executionRepo as never,
      { save: vi.fn() } as never,
      { createSignedUploadUrl: vi.fn() } as never,
      { findById: vi.fn() } as never,
      authSvc,
    );

    await expect(useCase.execute(VALID_INPUT)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws ExecutionAppointmentNotFoundError when appointment does not exist', async () => {
    const executionRepo = {
      findByAppointmentId: vi.fn().mockResolvedValue(makeExecution()),
    };
    const appointmentRepo = {
      findById: vi.fn().mockResolvedValue(null),
    };
    const authSvc = new AuthorizationService({ log: vi.fn() } as never);

    const useCase = new RequestAssetUploadUseCase(
      executionRepo as never,
      { save: vi.fn() } as never,
      { createSignedUploadUrl: vi.fn() } as never,
      appointmentRepo as never,
      authSvc,
    );

    await expect(useCase.execute(VALID_INPUT)).rejects.toBeInstanceOf(
      ExecutionAppointmentNotFoundError,
    );
  });

  it('throws ExecutionAppointmentNotFoundError when appointment is assigned to a different inspector', async () => {
    const executionRepo = {
      findByAppointmentId: vi.fn().mockResolvedValue(makeExecution()),
    };
    const appointmentRepo = {
      findById: vi.fn().mockResolvedValue(makeAppointmentResult({ inspectorId: 'insp-other' })),
    };
    const authSvc = new AuthorizationService({ log: vi.fn() } as never);

    const useCase = new RequestAssetUploadUseCase(
      executionRepo as never,
      { save: vi.fn() } as never,
      { createSignedUploadUrl: vi.fn() } as never,
      appointmentRepo as never,
      authSvc,
    );

    await expect(useCase.execute(VALID_INPUT)).rejects.toBeInstanceOf(
      ExecutionAppointmentNotFoundError,
    );
  });

  it('uses real tenantId in storage key when appointment exists', async () => {
    const executionRepo = {
      findByAppointmentId: vi.fn().mockResolvedValue(makeExecution()),
    };
    const appointmentRepo = {
      findById: vi.fn().mockResolvedValue(makeAppointmentResult({ tenantId: 'tenant-abc' })),
    };
    const assetRepo = { save: vi.fn().mockResolvedValue(undefined) };
    const storageService = {
      createSignedUploadUrl: vi.fn().mockResolvedValue({ url: 'https://example.com/upload' }),
    };

    const authSvc = new AuthorizationService({ log: vi.fn() } as never);
    const useCase = new RequestAssetUploadUseCase(
      executionRepo as never,
      assetRepo as never,
      storageService as never,
      appointmentRepo as never,
      authSvc,
    );

    const result = await useCase.execute(VALID_INPUT);

    expect(result.storageKey).toContain('tenant-abc');
    expect(result.storageKey).not.toContain('unknown');
    expect(result.uploadUrl).toBe('https://example.com/upload');
    expect(assetRepo.save).toHaveBeenCalledOnce();
  });
});
