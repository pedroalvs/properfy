import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RequestAssetUploadUseCase } from '../../../src/modules/inspector-execution/application/use-cases/request-asset-upload.use-case';
import { InspectionExecutionEntity } from '../../../src/modules/inspector-execution/domain/inspection-execution.entity';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import {
  ExecutionNotStartedError,
  ExecutionAlreadyFinishedError,
  ExecutionAppointmentNotFoundError,
  AssetMimeTypeNotAllowedError,
} from '../../../src/modules/inspector-execution/domain/inspection-execution.errors';
import type { AuthContext } from '@properfy/shared';

const executionRepo = {
  findByAppointmentId: vi.fn(),
  findByAppointmentIds: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
};

const assetRepo = {
  findById: vi.fn(),
  findByExecutionId: vi.fn(),
  findUploadedByExecutionId: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
};

const storageService = {
  createSignedUploadUrl: vi.fn(),
  headObject: vi.fn(),
};

const appointmentRepo = {
  findById: vi.fn(),
  findAll: vi.fn(),
  count: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
  saveContact: vi.fn(),
  updateContact: vi.fn(),
  saveRestriction: vi.fn(),
  deleteRestrictionsByAppointmentId: vi.fn(),
};

function makeExecution(overrides = {}) {
  return new InspectionExecutionEntity({
    id: 'exec-1',
    appointmentId: 'appt-1',
    inspectorId: 'insp-1',
    startedAt: new Date('2026-03-21T09:00:00Z'),
    finishedAt: null,
    resumedAt: null,
    startLatitude: -33.891,
    startLongitude: 151.277,
    finishLatitude: null,
    finishLongitude: null,
    geolocationDistanceMeters: null,
    checklistJson: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

const inspActor: AuthContext = {
  userId: 'insp-1',
  tenantId: 'tenant-1',
  role: 'INSP' as const,
  branchId: null,
  inspectorId: 'insp-1',
};

describe('RequestAssetUploadUseCase', () => {
  let useCase: RequestAssetUploadUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    useCase = new RequestAssetUploadUseCase(
      executionRepo,
      assetRepo,
      storageService,
      appointmentRepo,
    );
  });

  it('returns presigned URL and creates PENDING asset record', async () => {
    const execution = makeExecution();
    executionRepo.findByAppointmentId.mockResolvedValue(execution);
    appointmentRepo.findById.mockResolvedValue({
      appointment: { tenantId: 'tenant-1', inspectorId: 'insp-1' },
      contact: null,
      restrictions: [],
    });
    storageService.createSignedUploadUrl.mockResolvedValue({
      url: 'https://storage.example.com/signed-url',
      storageKey: 'some-key',
    });

    const result = await useCase.execute({
      appointmentId: 'appt-1',
      kind: 'PHOTO',
      mimeType: 'image/jpeg',
      fileName: 'photo.jpg',
      actor: inspActor,
    });

    expect(result.uploadUrl).toBe('https://storage.example.com/signed-url');
    expect(result.assetId).toBeDefined();
    expect(result.storageKey).toContain('inspections/tenant-1/appt-1/');
    expect(result.storageKey).toMatch(/\.jpg$/);
    expect(result.expiresAt).toBeDefined();

    expect(assetRepo.save).toHaveBeenCalledOnce();
    const savedAsset = assetRepo.save.mock.calls[0][0];
    expect(savedAsset.status).toBe('PENDING');
    expect(savedAsset.kind).toBe('PHOTO');
    expect(savedAsset.mimeType).toBe('image/jpeg');
    expect(savedAsset.uploadedBy).toBe('insp-1');
    expect(savedAsset.sizeBytes).toBeNull();
  });

  it('throws ForbiddenError when actor is not INSP', async () => {
    const nonInspActor: AuthContext = {
      userId: 'user-1',
      tenantId: 'tenant-1',
      role: 'OP' as const,
      branchId: null,
      inspectorId: null,
    };

    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        kind: 'PHOTO',
        mimeType: 'image/jpeg',
        fileName: 'photo.jpg',
        actor: nonInspActor,
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('throws ExecutionNotStartedError when no execution exists', async () => {
    executionRepo.findByAppointmentId.mockResolvedValue(null);

    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        kind: 'PHOTO',
        mimeType: 'image/jpeg',
        fileName: 'photo.jpg',
        actor: inspActor,
      }),
    ).rejects.toThrow(ExecutionNotStartedError);
  });

  it('throws ExecutionAlreadyFinishedError when execution is finished', async () => {
    const finishedExecution = makeExecution({
      finishedAt: new Date('2026-03-21T12:00:00Z'),
    });
    executionRepo.findByAppointmentId.mockResolvedValue(finishedExecution);

    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        kind: 'PHOTO',
        mimeType: 'image/jpeg',
        fileName: 'photo.jpg',
        actor: inspActor,
      }),
    ).rejects.toThrow(ExecutionAlreadyFinishedError);
  });

  it('throws AssetMimeTypeNotAllowedError for unsupported MIME type', async () => {
    const execution = makeExecution();
    executionRepo.findByAppointmentId.mockResolvedValue(execution);

    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        kind: 'PHOTO',
        mimeType: 'image/gif',
        fileName: 'animation.gif',
        actor: inspActor,
      }),
    ).rejects.toThrow(AssetMimeTypeNotAllowedError);
  });

  it('throws ExecutionAppointmentNotFoundError when appointment lookup returns null', async () => {
    const execution = makeExecution();
    executionRepo.findByAppointmentId.mockResolvedValue(execution);
    appointmentRepo.findById.mockResolvedValue(null);

    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        kind: 'PHOTO',
        mimeType: 'image/jpeg',
        fileName: 'photo.jpg',
        actor: inspActor,
      }),
    ).rejects.toThrow(ExecutionAppointmentNotFoundError);

    expect(storageService.createSignedUploadUrl).not.toHaveBeenCalled();
    expect(assetRepo.save).not.toHaveBeenCalled();
  });

  it('throws ExecutionAppointmentNotFoundError when appointment is assigned to another inspector', async () => {
    const execution = makeExecution();
    executionRepo.findByAppointmentId.mockResolvedValue(execution);
    appointmentRepo.findById.mockResolvedValue({
      appointment: { tenantId: 'tenant-1', inspectorId: 'insp-2' },
      contact: null,
      restrictions: [],
    });

    await expect(
      useCase.execute({
        appointmentId: 'appt-1',
        kind: 'PHOTO',
        mimeType: 'image/jpeg',
        fileName: 'photo.jpg',
        actor: inspActor,
      }),
    ).rejects.toThrow(ExecutionAppointmentNotFoundError);

    expect(storageService.createSignedUploadUrl).not.toHaveBeenCalled();
    expect(assetRepo.save).not.toHaveBeenCalled();
  });

  it('generates correct storage key pattern: inspections/{tenantId}/{appointmentId}/{uuid}.{ext}', async () => {
    const execution = makeExecution();
    executionRepo.findByAppointmentId.mockResolvedValue(execution);
    appointmentRepo.findById.mockResolvedValue({
      appointment: { tenantId: 'tenant-abc', inspectorId: 'insp-1' },
      contact: null,
      restrictions: [],
    });
    storageService.createSignedUploadUrl.mockResolvedValue({
      url: 'https://storage.example.com/signed-url',
      storageKey: 'some-key',
    });

    const result = await useCase.execute({
      appointmentId: 'appt-1',
      kind: 'DOCUMENT',
      mimeType: 'application/pdf',
      fileName: 'report.pdf',
      actor: inspActor,
    });

    const keyPattern = /^inspections\/tenant-abc\/appt-1\/[a-f0-9-]+\.pdf$/;
    expect(result.storageKey).toMatch(keyPattern);
  });

  it('sets uploadExpiresAt to 15 minutes from now', async () => {
    const execution = makeExecution();
    executionRepo.findByAppointmentId.mockResolvedValue(execution);
    appointmentRepo.findById.mockResolvedValue({
      appointment: { tenantId: 'tenant-1', inspectorId: 'insp-1' },
      contact: null,
      restrictions: [],
    });
    storageService.createSignedUploadUrl.mockResolvedValue({
      url: 'https://storage.example.com/signed-url',
      storageKey: 'some-key',
    });

    const before = Date.now();
    const result = await useCase.execute({
      appointmentId: 'appt-1',
      kind: 'PHOTO',
      mimeType: 'image/jpeg',
      fileName: 'photo.jpg',
      actor: inspActor,
    });
    const after = Date.now();

    const expiresAt = new Date(result.expiresAt).getTime();
    const fifteenMinMs = 15 * 60 * 1000;

    // expiresAt should be ~15 minutes from now (within a small tolerance)
    expect(expiresAt).toBeGreaterThanOrEqual(before + fifteenMinMs);
    expect(expiresAt).toBeLessThanOrEqual(after + fifteenMinMs);

    // Also verify the saved asset has the correct uploadExpiresAt
    const savedAsset = assetRepo.save.mock.calls[0][0];
    expect(savedAsset.uploadExpiresAt).toBeInstanceOf(Date);
    expect(savedAsset.uploadExpiresAt.getTime()).toBe(expiresAt);
  });
});
