import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetInspectorScheduleUseCase } from '../../../src/modules/inspector-execution/application/use-cases/get-inspector-schedule.use-case';
import type { IAppointmentRepository, AppointmentListItem } from '../../../src/modules/appointment/domain/appointment.repository';
import type { IInspectionExecutionRepository } from '../../../src/modules/inspector-execution/domain/inspection-execution.repository';
import type { IServiceTypeReader } from '../../../src/modules/inspector-execution/domain/service-type-reader';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { InspectionExecutionEntity } from '../../../src/modules/inspector-execution/domain/inspection-execution.entity';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import type { AuthContext } from '@properfy/shared';

function makeAppointment(
  overrides: Partial<ConstructorParameters<typeof AppointmentEntity>[0]> = {},
): AppointmentListItem {
  return {
    appointment: new AppointmentEntity({
      id: 'appt-1',
      tenantId: 'tenant-1',
      branchId: 'branch-1',
      propertyId: 'prop-1',
      serviceTypeId: 'st-1',
      inspectorId: 'insp-1',
      status: 'SCHEDULED',
      scheduledDate: new Date('2026-03-21'),
      timeSlot: '09:00-11:00',
      keyRequired: false,
      meetingLocation: null,
      keyLocation: null,
      tenantConfirmationStatus: 'CONFIRMED',
      priceAmount: 200,
      payoutAmount: 140,
      pricingRuleSnapshotJson: {},
      notes: null,
      customFieldsJson: null,
      reason: null,
      createdByUserId: 'user-1',
      doneCheckedByUserId: null,
      doneCheckedAt: null,
      serviceGroupId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      ...overrides,
    }),
    contact: null,
    propertyCode: 'PROP-001',
    propertyAddress: '1 Test St, Suburb NSW 2000',
    branchName: 'Main Branch',
    serviceTypeName: 'Routine Inspection',
    inspectorName: 'Test Inspector',
  };
}

function makeExecution(
  overrides: Partial<ConstructorParameters<typeof InspectionExecutionEntity>[0]> = {},
): InspectionExecutionEntity {
  return new InspectionExecutionEntity({
    id: 'exec-1',
    appointmentId: 'appt-1',
    inspectorId: 'insp-1',
    startedAt: new Date('2026-03-21T09:00:00Z'),
    finishedAt: null,
    startLatitude: -33.8688,
    startLongitude: 151.2093,
    finishLatitude: null,
    finishLongitude: null,
    checklistJson: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });
}

const inspActor: AuthContext = {
  userId: 'insp-1',
  tenantId: null,
  role: 'INSP',
  branchId: null,
  inspectorId: 'insp-1',
};

describe('GetInspectorScheduleUseCase', () => {
  let appointmentRepo: IAppointmentRepository;
  let executionRepo: IInspectionExecutionRepository;
  let serviceTypeReader: IServiceTypeReader;
  let useCase: GetInspectorScheduleUseCase;

  beforeEach(() => {
    appointmentRepo = {
      findById: vi.fn(),
      findAll: vi.fn().mockResolvedValue([]),
      count: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      saveContact: vi.fn(),
      updateContact: vi.fn(),
      saveRestriction: vi.fn(),
      deleteRestrictionsByAppointmentId: vi.fn(),
      findScheduledOnDate: vi.fn(),
      findDuplicateForImport: vi.fn(),
    };

    executionRepo = {
      findByAppointmentId: vi.fn(),
      findByAppointmentIds: vi.fn().mockResolvedValue([]),
      save: vi.fn(),
      update: vi.fn(),
    };

    serviceTypeReader = {
      findById: vi.fn(),
      findByIds: vi.fn().mockResolvedValue([]),
    };

    useCase = new GetInspectorScheduleUseCase(appointmentRepo, executionRepo, serviceTypeReader);
  });

  it('should return schedule for target date with execution statuses', async () => {
    const appt1 = makeAppointment({ id: 'appt-1' });
    const appt2 = makeAppointment({ id: 'appt-2', timeSlot: '14:00-16:00' });
    vi.mocked(appointmentRepo.findAll).mockResolvedValue([appt1, appt2]);
    vi.mocked(serviceTypeReader.findByIds).mockResolvedValue([
      { id: 'st-1', code: 'ROUTINE', name: 'Routine Inspection', flowType: 'ROUTINE' },
    ]);
    vi.mocked(executionRepo.findByAppointmentIds).mockResolvedValue([
      makeExecution({ appointmentId: 'appt-1' }),
    ]);

    const result = await useCase.execute({ date: '2026-03-21', actor: inspActor });

    expect(result.date).toBe('2026-03-21');
    expect(result.appointments).toHaveLength(2);
    expect(result.appointments[0].id).toBe('appt-1');
    expect(result.appointments[0].executionStatus).toBe('IN_PROGRESS');
    expect(result.appointments[1].id).toBe('appt-2');
    expect(result.appointments[1].executionStatus).toBe('NOT_STARTED');
  });

  it('should return empty appointments array when no SCHEDULED appointments exist', async () => {
    vi.mocked(appointmentRepo.findAll).mockResolvedValue([]);

    const result = await useCase.execute({ date: '2026-03-21', actor: inspActor });

    expect(result.date).toBe('2026-03-21');
    expect(result.appointments).toHaveLength(0);
  });

  it('should throw ForbiddenError when actor role is not INSP', async () => {
    const amActor: AuthContext = { userId: 'user-1', tenantId: null, role: 'AM', branchId: null, inspectorId: null };

    await expect(useCase.execute({ date: '2026-03-21', actor: amActor })).rejects.toThrow(
      ForbiddenError,
    );
  });

  it('should filter out ROUTINE appointments at T-1 that are not confirmed', async () => {
    // Today is March 20, appointment is March 21 (T-1)
    // Use T12:00:00Z to ensure getDate() returns the expected day in any timezone
    const today = new Date('2026-03-20T12:00:00Z');
    vi.useFakeTimers({ now: today });

    const appt = makeAppointment({
      scheduledDate: new Date('2026-03-21T12:00:00Z'),
      tenantConfirmationStatus: 'PENDING',
      keyRequired: false,
    });
    vi.mocked(appointmentRepo.findAll).mockResolvedValue([appt]);
    vi.mocked(serviceTypeReader.findByIds).mockResolvedValue([
      { id: 'st-1', code: 'ROUTINE', name: 'Routine Inspection', flowType: 'ROUTINE' },
    ]);

    const result = await useCase.execute({ date: '2026-03-21', actor: inspActor });

    expect(result.appointments).toHaveLength(0);

    vi.useRealTimers();
  });

  it('should keep INGOING appointments at T-1 even if not confirmed', async () => {
    const today = new Date('2026-03-20T12:00:00Z');
    vi.useFakeTimers({ now: today });

    const appt = makeAppointment({
      scheduledDate: new Date('2026-03-21T12:00:00Z'),
      tenantConfirmationStatus: 'PENDING',
      keyRequired: false,
    });
    vi.mocked(appointmentRepo.findAll).mockResolvedValue([appt]);
    vi.mocked(serviceTypeReader.findByIds).mockResolvedValue([
      { id: 'st-1', code: 'INGOING', name: 'Ingoing Inspection', flowType: 'INGOING' },
    ]);
    vi.mocked(executionRepo.findByAppointmentIds).mockResolvedValue([]);

    const result = await useCase.execute({ date: '2026-03-21', actor: inspActor });

    expect(result.appointments).toHaveLength(1);

    vi.useRealTimers();
  });

  it('should keep ROUTINE appointments at T-1 when keyRequired is true', async () => {
    const today = new Date('2026-03-20T12:00:00Z');
    vi.useFakeTimers({ now: today });

    const appt = makeAppointment({
      scheduledDate: new Date('2026-03-21T12:00:00Z'),
      tenantConfirmationStatus: 'PENDING',
      keyRequired: true,
    });
    vi.mocked(appointmentRepo.findAll).mockResolvedValue([appt]);
    vi.mocked(serviceTypeReader.findByIds).mockResolvedValue([
      { id: 'st-1', code: 'ROUTINE', name: 'Routine Inspection', flowType: 'ROUTINE' },
    ]);
    vi.mocked(executionRepo.findByAppointmentIds).mockResolvedValue([]);

    const result = await useCase.execute({ date: '2026-03-21', actor: inspActor });

    expect(result.appointments).toHaveLength(1);
    expect(result.appointments[0].keyRequired).toBe(true);

    vi.useRealTimers();
  });

  it('should use today date when no date param provided', async () => {
    const today = new Date('2026-03-21T10:00:00Z');
    vi.useFakeTimers({ now: today });

    vi.mocked(appointmentRepo.findAll).mockResolvedValue([]);

    const result = await useCase.execute({ actor: inspActor });

    expect(result.date).toBe('2026-03-21');
    expect(appointmentRepo.findAll).toHaveBeenCalledWith(
      expect.objectContaining({
        fromDate: '2026-03-21',
        toDate: '2026-03-21',
      }),
      expect.any(Object),
    );

    vi.useRealTimers();
  });

  it('should filter out ROUTINE appointments for today when still pending confirmation', async () => {
    const today = new Date('2026-03-21T12:00:00Z');
    vi.useFakeTimers({ now: today });

    const appt = makeAppointment({
      scheduledDate: new Date('2026-03-21T12:00:00Z'),
      tenantConfirmationStatus: 'PENDING',
      keyRequired: false,
    });
    vi.mocked(appointmentRepo.findAll).mockResolvedValue([appt]);
    vi.mocked(serviceTypeReader.findByIds).mockResolvedValue([
      { id: 'st-1', code: 'ROUTINE', name: 'Routine Inspection', flowType: 'ROUTINE' },
    ]);

    const result = await useCase.execute({ date: '2026-03-21', actor: inspActor });

    expect(result.appointments).toHaveLength(0);

    vi.useRealTimers();
  });

  it('should filter out ROUTINE appointments for today when tenant marked UNAVAILABLE', async () => {
    const today = new Date('2026-03-21T12:00:00Z');
    vi.useFakeTimers({ now: today });

    const appt = makeAppointment({
      scheduledDate: new Date('2026-03-21T12:00:00Z'),
      tenantConfirmationStatus: 'UNAVAILABLE',
      keyRequired: false,
    });
    vi.mocked(appointmentRepo.findAll).mockResolvedValue([appt]);
    vi.mocked(serviceTypeReader.findByIds).mockResolvedValue([
      { id: 'st-1', code: 'ROUTINE', name: 'Routine Inspection', flowType: 'ROUTINE' },
    ]);

    const result = await useCase.execute({ date: '2026-03-21', actor: inspActor });

    expect(result.appointments).toHaveLength(0);

    vi.useRealTimers();
  });

  it('should not constrain the schedule by actor tenantId for global inspectors', async () => {
    vi.mocked(appointmentRepo.findAll).mockResolvedValue([]);

    await useCase.execute({ date: '2026-03-21', actor: inspActor });

    expect(appointmentRepo.findAll).toHaveBeenCalledWith(
      {
        inspectorId: 'insp-1',
        status: 'SCHEDULED',
        fromDate: '2026-03-21',
        toDate: '2026-03-21',
      },
      expect.any(Object),
    );
  });

  it('should mark finished executions correctly', async () => {
    const appt = makeAppointment();
    vi.mocked(appointmentRepo.findAll).mockResolvedValue([appt]);
    vi.mocked(serviceTypeReader.findByIds).mockResolvedValue([
      { id: 'st-1', code: 'ROUTINE', name: 'Routine Inspection', flowType: 'ROUTINE' },
    ]);
    vi.mocked(executionRepo.findByAppointmentIds).mockResolvedValue([
      makeExecution({
        appointmentId: 'appt-1',
        finishedAt: new Date('2026-03-21T11:00:00Z'),
      }),
    ]);

    const result = await useCase.execute({ date: '2026-03-21', actor: inspActor });

    expect(result.appointments[0].executionStatus).toBe('FINISHED');
  });
});
