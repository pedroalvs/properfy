import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GetInspectorScheduleUseCase } from '../../../src/modules/inspector-execution/application/use-cases/get-inspector-schedule.use-case';
import type { IAppointmentRepository, AppointmentListItem } from '../../../src/modules/appointment/domain/appointment.repository';
import type { IInspectionExecutionRepository } from '../../../src/modules/inspector-execution/domain/inspection-execution.repository';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { InspectionExecutionEntity } from '../../../src/modules/inspector-execution/domain/inspection-execution.entity';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
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
      timeSlotStart: '09:00', timeSlotEnd: '11:00',
      keyRequired: false,
      meetingLocation: null,
      keyLocation: null,
      rentalTenantConfirmationStatus: 'CONFIRMED',
      priceAmount: 200,
      payoutAmount: 140,
      pricingRuleSnapshotJson: {},
      notes: null,
      customFieldsJson: null,
      reason: null,
      createdByUserId: 'user-1',
      doneMarkedByUserId: null,
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
    resumedAt: null,
    startLatitude: -33.8688,
    startLongitude: 151.2093,
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
  tenantId: null,
  role: 'INSP',
  branchId: null,
  inspectorId: 'insp-1',
};

describe('GetInspectorScheduleUseCase', () => {
  let appointmentRepo: IAppointmentRepository;
  let executionRepo: IInspectionExecutionRepository;
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
      findAllContacts: vi.fn(),
      countContacts: vi.fn(),
      findContactById: vi.fn(),
      findVisibleForInspector: vi.fn().mockResolvedValue([]),
      isAppointmentVisibleForInspector: vi.fn(),
    };

    executionRepo = {
      findByAppointmentId: vi.fn(),
      findByAppointmentIds: vi.fn().mockResolvedValue([]),
      save: vi.fn(),
      update: vi.fn(),
    };

    const authorizationService = new AuthorizationService({ log: vi.fn() } as never);
    useCase = new GetInspectorScheduleUseCase(appointmentRepo, executionRepo, authorizationService);
  });

  it('should return schedule for target date with execution statuses', async () => {
    const appt1 = makeAppointment({ id: 'appt-1' });
    const appt2 = makeAppointment({ id: 'appt-2', timeSlotStart: '14:00', timeSlotEnd: '16:00' });
    vi.mocked(appointmentRepo.findVisibleForInspector).mockResolvedValue([appt1, appt2]);
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

  it('should return the requested date string for items even if the stored timestamp drifts', async () => {
    const drifted = makeAppointment({
      scheduledDate: new Date('2026-03-20T23:00:00.000Z'),
    });
    vi.mocked(appointmentRepo.findVisibleForInspector).mockResolvedValue([drifted]);

    const result = await useCase.execute({ date: '2026-03-21', actor: inspActor });

    expect(result.appointments).toHaveLength(1);
    expect(result.appointments[0].scheduledDate).toBe('2026-03-21');
  });

  it('should return empty appointments array when no visible appointments exist', async () => {
    vi.mocked(appointmentRepo.findVisibleForInspector).mockResolvedValue([]);

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

  it('should delegate T-1 filtering to findVisibleForInspector (centralized)', async () => {
    // findVisibleForInspector returns pre-filtered results — the use case trusts them
    vi.mocked(appointmentRepo.findVisibleForInspector).mockResolvedValue([]);

    await useCase.execute({ date: '2026-03-21', actor: inspActor });

    expect(appointmentRepo.findVisibleForInspector).toHaveBeenCalledWith(
      expect.objectContaining({
        inspectorId: 'insp-1',
        fromDate: '2026-03-21',
        toDate: '2026-03-21',
        today: expect.any(Date),
      }),
    );
  });

  it('should use today date when no date param provided', async () => {
    const today = new Date('2026-03-21T10:00:00Z');
    vi.useFakeTimers({ now: today });

    vi.mocked(appointmentRepo.findVisibleForInspector).mockResolvedValue([]);

    const result = await useCase.execute({ actor: inspActor });

    expect(result.date).toBe('2026-03-21');
    expect(appointmentRepo.findVisibleForInspector).toHaveBeenCalledWith(
      expect.objectContaining({
        fromDate: '2026-03-21',
        toDate: '2026-03-21',
      }),
    );

    vi.useRealTimers();
  });

  it('should not constrain the schedule by actor tenantId for global inspectors', async () => {
    vi.mocked(appointmentRepo.findVisibleForInspector).mockResolvedValue([]);

    await useCase.execute({ date: '2026-03-21', actor: inspActor });

    expect(appointmentRepo.findVisibleForInspector).toHaveBeenCalledWith(
      expect.objectContaining({
        inspectorId: 'insp-1',
      }),
    );
  });

  it('should mark finished executions correctly', async () => {
    const appt = makeAppointment();
    vi.mocked(appointmentRepo.findVisibleForInspector).mockResolvedValue([appt]);
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
