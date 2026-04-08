import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SaveExecutionProgressUseCase } from '../../../src/modules/inspector-execution/application/use-cases/save-execution-progress.use-case';
import { InspectionExecutionEntity } from '../../../src/modules/inspector-execution/domain/inspection-execution.entity';
import {
  ExecutionNotStartedError,
  ExecutionAlreadyFinishedError,
} from '../../../src/modules/inspector-execution/domain/inspection-execution.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';

const executionRepo = {
  findByAppointmentId: vi.fn(),
  findByAppointmentIds: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
  findStuckExecutions: vi.fn(),
};

const inspActor = {
  userId: 'user-insp-1',
  tenantId: 'tenant-1',
  role: 'INSP' as const,
  branchId: null,
  inspectorId: 'insp-1',
};

function makeExecution(overrides = {}) {
  return new InspectionExecutionEntity({
    id: 'exec-1',
    appointmentId: 'appt-1',
    inspectorId: 'insp-1',
    startedAt: new Date('2026-04-06T09:00:00Z'),
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

function makeSut() {
  return new SaveExecutionProgressUseCase(executionRepo);
}

describe('SaveExecutionProgressUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executionRepo.update.mockResolvedValue(undefined);
  });

  it('should save checklist on a started execution', async () => {
    const sut = makeSut();
    executionRepo.findByAppointmentId.mockResolvedValue(makeExecution());

    const checklist = { room1: 'ok', room2: 'damaged' };
    const result = await sut.execute({
      appointmentId: 'appt-1',
      checklistJson: checklist,
      actor: inspActor,
    });

    expect(result.executionId).toBe('exec-1');
    expect(result.appointmentId).toBe('appt-1');
    expect(result.checklistJson).toEqual(checklist);
    expect(result.updatedAt).toBeDefined();

    expect(executionRepo.update).toHaveBeenCalledOnce();
    expect(executionRepo.update).toHaveBeenCalledWith('exec-1', { checklistJson: checklist });
  });

  it('should save notes on a started execution', async () => {
    const sut = makeSut();
    executionRepo.findByAppointmentId.mockResolvedValue(makeExecution());

    const result = await sut.execute({
      appointmentId: 'appt-1',
      notes: 'Tenant was cooperative',
      actor: inspActor,
    });

    expect(result.notes).toBe('Tenant was cooperative');
    expect(executionRepo.update).toHaveBeenCalledWith('exec-1', { notes: 'Tenant was cooperative' });
  });

  it('should save both checklist and notes together', async () => {
    const sut = makeSut();
    executionRepo.findByAppointmentId.mockResolvedValue(makeExecution());

    const checklist = { kitchen: 'clean' };
    const result = await sut.execute({
      appointmentId: 'appt-1',
      checklistJson: checklist,
      notes: 'All good',
      actor: inspActor,
    });

    expect(result.checklistJson).toEqual(checklist);
    expect(result.notes).toBe('All good');
    expect(executionRepo.update).toHaveBeenCalledWith('exec-1', {
      checklistJson: checklist,
      notes: 'All good',
    });
  });

  it('should throw ExecutionAlreadyFinishedError when execution is finished', async () => {
    const sut = makeSut();
    executionRepo.findByAppointmentId.mockResolvedValue(
      makeExecution({ finishedAt: new Date('2026-04-06T10:00:00Z') }),
    );

    await expect(
      sut.execute({
        appointmentId: 'appt-1',
        checklistJson: { room: 'ok' },
        actor: inspActor,
      }),
    ).rejects.toThrow(ExecutionAlreadyFinishedError);

    expect(executionRepo.update).not.toHaveBeenCalled();
  });

  it('should throw ExecutionNotStartedError when no execution exists', async () => {
    const sut = makeSut();
    executionRepo.findByAppointmentId.mockResolvedValue(null);

    await expect(
      sut.execute({
        appointmentId: 'appt-nonexistent',
        checklistJson: { room: 'ok' },
        actor: inspActor,
      }),
    ).rejects.toThrow(ExecutionNotStartedError);

    expect(executionRepo.update).not.toHaveBeenCalled();
  });

  it('should throw ForbiddenError when actor is not INSP', async () => {
    const sut = makeSut();

    await expect(
      sut.execute({
        appointmentId: 'appt-1',
        checklistJson: { room: 'ok' },
        actor: { userId: 'user-1', tenantId: 'tenant-1', role: 'CL_ADMIN' as any, branchId: null, inspectorId: null },
      }),
    ).rejects.toThrow(ForbiddenError);

    expect(executionRepo.findByAppointmentId).not.toHaveBeenCalled();
    expect(executionRepo.update).not.toHaveBeenCalled();
  });

  it('should throw ForbiddenError when inspector is not the owner of the execution', async () => {
    const sut = makeSut();
    executionRepo.findByAppointmentId.mockResolvedValue(
      makeExecution({ inspectorId: 'other-inspector' }),
    );

    await expect(
      sut.execute({
        appointmentId: 'appt-1',
        checklistJson: { room: 'ok' },
        actor: inspActor,
      }),
    ).rejects.toThrow(ForbiddenError);

    expect(executionRepo.update).not.toHaveBeenCalled();
  });

  it('should preserve existing checklistJson when only notes is provided', async () => {
    const sut = makeSut();
    const existingChecklist = { room1: 'ok' };
    executionRepo.findByAppointmentId.mockResolvedValue(
      makeExecution({ checklistJson: existingChecklist }),
    );

    const result = await sut.execute({
      appointmentId: 'appt-1',
      notes: 'Some notes',
      actor: inspActor,
    });

    expect(result.checklistJson).toEqual(existingChecklist);
    expect(executionRepo.update).toHaveBeenCalledWith('exec-1', { notes: 'Some notes' });
  });

  it('should preserve existing notes when only checklistJson is provided', async () => {
    const sut = makeSut();
    executionRepo.findByAppointmentId.mockResolvedValue(
      makeExecution({ notes: 'Existing notes' }),
    );

    const checklist = { room: 'checked' };
    const result = await sut.execute({
      appointmentId: 'appt-1',
      checklistJson: checklist,
      actor: inspActor,
    });

    expect(result.notes).toBe('Existing notes');
    expect(executionRepo.update).toHaveBeenCalledWith('exec-1', { checklistJson: checklist });
  });
});
