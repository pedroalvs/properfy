import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PLATFORM_TIMEZONE, zonedWallTimeToUtc } from '@properfy/shared';
import { StartInspectionUseCase } from '../../../src/modules/inspector-execution/application/use-cases/start-inspection.use-case';
import { InspectionExecutionEntity } from '../../../src/modules/inspector-execution/domain/inspection-execution.entity';
import {
  ExecutionAppointmentNotFoundError,
  ExecutionAlreadyFinishedError,
  ExecutionT1BlockedError,
  ExecutionTimeWindowError,
} from '../../../src/modules/inspector-execution/domain/inspection-execution.errors';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';

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
  replaceRestrictions: vi.fn(),
  findScheduledOnDate: vi.fn(),
  findDuplicateForImport: vi.fn(),
  findAllContacts: vi.fn(),
  countContacts: vi.fn(),
  findContactById: vi.fn(),
  findVisibleForInspector: vi.fn(),
  isAppointmentVisibleForInspector: vi.fn(),
};

const executionRepo = {
  findByAppointmentId: vi.fn(),
  findByAppointmentIds: vi.fn(),
  save: vi.fn(),
  update: vi.fn(),
};

const idempotencyService = {
  get: vi.fn(),
  set: vi.fn(),
};

const auditService = { log: vi.fn() };

// Flow type drives whether tenant confirmation is required; default ROUTINE.
const serviceTypeReader = { findById: vi.fn() };

function makeAppointmentWithRelations(overrides: Record<string, unknown> = {}, relationOverrides: Record<string, unknown> = {}) {
  const appointment = {
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
  };
  return {
    appointment,
    contact: null,
    restrictions: [],
    propertyLatitude: null as number | null,
    propertyLongitude: null as number | null,
    ...relationOverrides,
  };
}

const inspActor = {
  userId: 'insp-1',
  tenantId: 'tenant-1',
  role: 'INSP' as const,
  branchId: null,
  inspectorId: 'insp-1',
};

function makeSut() {
  const authorizationService = new AuthorizationService(auditService as any);
  return new StartInspectionUseCase(
    appointmentRepo as any,
    executionRepo,
    idempotencyService,
    auditService as any,
    serviceTypeReader,
    authorizationService,
  );
}

describe('StartInspectionUseCase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set fake time within the default appointment time window
    // (09:00-11:00 Sydney wall time on 2026-03-21)
    vi.useFakeTimers({ now: zonedWallTimeToUtc('2026-03-21', '10:00', PLATFORM_TIMEZONE) });
    idempotencyService.get.mockResolvedValue(null);
    executionRepo.findByAppointmentId.mockResolvedValue(null);
    executionRepo.save.mockResolvedValue(undefined);
    idempotencyService.set.mockResolvedValue(undefined);
    appointmentRepo.isAppointmentVisibleForInspector.mockResolvedValue(true);
    serviceTypeReader.findById.mockResolvedValue({ flowType: 'ROUTINE' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should create InspectionExecution with correct coordinates and timestamps', async () => {
    const sut = makeSut();
    appointmentRepo.findById.mockResolvedValue(makeAppointmentWithRelations());

    const result = await sut.execute({
      appointmentId: 'appt-1',
      latitude: -33.891,
      longitude: 151.277,
      idempotencyKey: 'key-1',
      actor: inspActor,
    });

    expect(result.appointmentId).toBe('appt-1');
    expect(result.startLatitude).toBe(-33.891);
    expect(result.startLongitude).toBe(151.277);
    expect(result.status).toBe('IN_PROGRESS');
    expect(result.executionId).toBeDefined();
    expect(result.startedAt).toBeDefined();

    expect(executionRepo.save).toHaveBeenCalledOnce();
    const savedExecution = executionRepo.save.mock.calls[0][0] as InspectionExecutionEntity;
    expect(savedExecution.appointmentId).toBe('appt-1');
    expect(savedExecution.inspectorId).toBe('insp-1');
    expect(savedExecution.startLatitude).toBe(-33.891);
    expect(savedExecution.startLongitude).toBe(151.277);
    expect(savedExecution.finishedAt).toBeNull();
  });

  it('should return existing execution if appointment already has one in progress (idempotent start)', async () => {
    const sut = makeSut();
    appointmentRepo.findById.mockResolvedValue(makeAppointmentWithRelations());

    const existingExecution = new InspectionExecutionEntity({
      id: 'exec-existing',
      appointmentId: 'appt-1',
      inspectorId: 'insp-1',
      startedAt: new Date('2026-03-21T09:00:00Z'),
      finishedAt: null,
      resumedAt: null,
      startLatitude: -33.5,
      startLongitude: 151.0,
      finishLatitude: null,
      finishLongitude: null,
      geolocationDistanceMeters: 120,
      checklistJson: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    executionRepo.findByAppointmentId.mockResolvedValue(existingExecution);

    const result = await sut.execute({
      appointmentId: 'appt-1',
      latitude: -33.891,
      longitude: 151.277,
      idempotencyKey: 'key-2',
      actor: inspActor,
    });

    expect(result.executionId).toBe('exec-existing');
    expect(result.startLatitude).toBe(-33.5);
    expect(result.startLongitude).toBe(151.0);
    expect(result.status).toBe('IN_PROGRESS');
    expect(executionRepo.save).not.toHaveBeenCalled();
  });

  it('should return cached response when same idempotency key is used', async () => {
    const sut = makeSut();
    const cachedOutput = {
      executionId: 'exec-cached',
      appointmentId: 'appt-1',
      startedAt: '2026-03-21T09:00:00.000Z',
      startLatitude: -33.891,
      startLongitude: 151.277,
      status: 'IN_PROGRESS' as const,
    };
    idempotencyService.get.mockResolvedValue(cachedOutput);

    const result = await sut.execute({
      appointmentId: 'appt-1',
      latitude: -33.891,
      longitude: 151.277,
      idempotencyKey: 'key-cached',
      actor: inspActor,
    });

    expect(result).toEqual(cachedOutput);
    expect(appointmentRepo.findById).not.toHaveBeenCalled();
    expect(executionRepo.save).not.toHaveBeenCalled();
  });

  it('should throw ExecutionAppointmentNotFoundError when appointment not found', async () => {
    const sut = makeSut();
    appointmentRepo.findById.mockResolvedValue(null);

    await expect(
      sut.execute({
        appointmentId: 'nonexistent',
        latitude: -33.891,
        longitude: 151.277,
        idempotencyKey: 'key-3',
        actor: inspActor,
      }),
    ).rejects.toThrow(ExecutionAppointmentNotFoundError);
  });

  it('should throw ExecutionAppointmentNotFoundError when status is not SCHEDULED', async () => {
    const sut = makeSut();
    appointmentRepo.findById.mockResolvedValue(
      makeAppointmentWithRelations({ status: 'DRAFT' }),
    );

    await expect(
      sut.execute({
        appointmentId: 'appt-1',
        latitude: -33.891,
        longitude: 151.277,
        idempotencyKey: 'key-4',
        actor: inspActor,
      }),
    ).rejects.toThrow(ExecutionAppointmentNotFoundError);
  });

  it('should throw ExecutionAppointmentNotFoundError when inspector does not match', async () => {
    const sut = makeSut();
    appointmentRepo.findById.mockResolvedValue(
      makeAppointmentWithRelations({ inspectorId: 'other-inspector' }),
    );

    await expect(
      sut.execute({
        appointmentId: 'appt-1',
        latitude: -33.891,
        longitude: 151.277,
        idempotencyKey: 'key-5',
        actor: inspActor,
      }),
    ).rejects.toThrow(ExecutionAppointmentNotFoundError);
  });

  it('should throw ExecutionAlreadyFinishedError when execution already finished', async () => {
    const sut = makeSut();
    appointmentRepo.findById.mockResolvedValue(makeAppointmentWithRelations());

    const finishedExecution = new InspectionExecutionEntity({
      id: 'exec-finished',
      appointmentId: 'appt-1',
      inspectorId: 'insp-1',
      startedAt: new Date('2026-03-21T09:00:00Z'),
      finishedAt: new Date('2026-03-21T10:00:00Z'),
      resumedAt: null,
      startLatitude: -33.5,
      startLongitude: 151.0,
      finishLatitude: -33.6,
      finishLongitude: 151.1,
      geolocationDistanceMeters: null,
      checklistJson: null,
      notes: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    executionRepo.findByAppointmentId.mockResolvedValue(finishedExecution);

    await expect(
      sut.execute({
        appointmentId: 'appt-1',
        latitude: -33.891,
        longitude: 151.277,
        idempotencyKey: 'key-6',
        actor: inspActor,
      }),
    ).rejects.toThrow(ExecutionAlreadyFinishedError);
  });

  it('should throw ExecutionT1BlockedError when appointment is not visible (T-1 rule)', async () => {
    const sut = makeSut();
    appointmentRepo.findById.mockResolvedValue(makeAppointmentWithRelations());
    appointmentRepo.isAppointmentVisibleForInspector.mockResolvedValue(false);

    await expect(
      sut.execute({
        appointmentId: 'appt-1',
        latitude: -33.891,
        longitude: 151.277,
        idempotencyKey: 'key-7',
        actor: inspActor,
      }),
    ).rejects.toThrow(ExecutionT1BlockedError);
  });

  it('should throw ForbiddenError when actor is not INSP', async () => {
    const sut = makeSut();

    await expect(
      sut.execute({
        appointmentId: 'appt-1',
        latitude: -33.891,
        longitude: 151.277,
        idempotencyKey: 'key-8',
        actor: { userId: 'user-1', tenantId: 'tenant-1', role: 'CL_ADMIN' as any, branchId: null, inspectorId: null },
      }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('should call audit log after creating execution', async () => {
    const sut = makeSut();
    appointmentRepo.findById.mockResolvedValue(makeAppointmentWithRelations());

    await sut.execute({
      appointmentId: 'appt-1',
      latitude: -33.891,
      longitude: 151.277,
      idempotencyKey: 'key-9',
      actor: inspActor,
    });

    expect(auditService.log).toHaveBeenCalledTimes(2);
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'inspection_execution.started',
        actorType: 'USER',
        actorId: 'insp-1',
        entityType: 'InspectionExecution',
        tenantId: 'tenant-1',
      }),
    );
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'inspection.started',
        entityType: 'Appointment',
        entityId: 'appt-1',
        tenantId: 'tenant-1',
      }),
    );
  });

  it('should store idempotency result after creating execution', async () => {
    const sut = makeSut();
    appointmentRepo.findById.mockResolvedValue(makeAppointmentWithRelations());

    const result = await sut.execute({
      appointmentId: 'appt-1',
      latitude: -33.891,
      longitude: 151.277,
      idempotencyKey: 'key-10',
      actor: inspActor,
    });

    expect(idempotencyService.set).toHaveBeenCalledOnce();
    expect(idempotencyService.set).toHaveBeenCalledWith('key-10', 'start', result, 24);
  });

  it('should throw ExecutionTimeWindowError the day before the scheduled date', async () => {
    const sut = makeSut();
    // Appointment scheduled for 2026-03-21; 23:59 Sydney on the 20th is still too early.
    vi.setSystemTime(zonedWallTimeToUtc('2026-03-20', '23:59', PLATFORM_TIMEZONE));

    appointmentRepo.findById.mockResolvedValue(makeAppointmentWithRelations());

    // The gate's own reason must reach the client: it travels in the 422 envelope
    // and the PWA renders it verbatim in a snackbar. Dropping `gateCheck.reason`
    // for the fallback string would still satisfy a bare `toThrow(Error)`.
    await expect(
      sut.execute({
        appointmentId: 'appt-1',
        latitude: -33.891,
        longitude: 151.277,
        idempotencyKey: 'key-tw-1',
        actor: inspActor,
      }),
    ).rejects.toThrow(/can be started from 21\/03\/2026/);
  });

  it('should allow starting before the time slot opens on the scheduled day', async () => {
    const sut = makeSut();
    // Slot is 09:00-11:00; 06:00 Sydney used to be rejected as "too early".
    vi.setSystemTime(zonedWallTimeToUtc('2026-03-21', '06:00', PLATFORM_TIMEZONE));

    appointmentRepo.findById.mockResolvedValue(makeAppointmentWithRelations());

    const result = await sut.execute({
      appointmentId: 'appt-1',
      latitude: -33.891,
      longitude: 151.277,
      idempotencyKey: 'key-tw-2',
      actor: inspActor,
    });

    expect(result.status).toBe('IN_PROGRESS');
  });

  it('should allow starting after the time slot closed on the scheduled day', async () => {
    const sut = makeSut();
    // Slot is 09:00-11:00; 14:00 Sydney used to be rejected as "too late".
    vi.setSystemTime(zonedWallTimeToUtc('2026-03-21', '14:00', PLATFORM_TIMEZONE));

    appointmentRepo.findById.mockResolvedValue(makeAppointmentWithRelations());

    const result = await sut.execute({
      appointmentId: 'appt-1',
      latitude: -33.891,
      longitude: 151.277,
      idempotencyKey: 'key-tw-3',
      actor: inspActor,
    });

    expect(result.status).toBe('IN_PROGRESS');
  });

  it('should allow starting a SCHEDULED appointment whose date has already passed', async () => {
    const sut = makeSut();
    // Two weeks after the scheduled date — the case that was permanently blocked
    // before: visible in the schedule, flagged overdue, but impossible to execute.
    vi.setSystemTime(zonedWallTimeToUtc('2026-04-04', '09:30', PLATFORM_TIMEZONE));

    appointmentRepo.findById.mockResolvedValue(makeAppointmentWithRelations());

    const result = await sut.execute({
      appointmentId: 'appt-1',
      latitude: -33.891,
      longitude: 151.277,
      idempotencyKey: 'key-tw-4',
      actor: inspActor,
    });

    expect(result.status).toBe('IN_PROGRESS');
    expect(result.appointmentId).toBe('appt-1');
  });

  it('should refuse an unconfirmed routine inspection whose date has passed', async () => {
    const sut = makeSut();
    // T1VisibilityService only blocks an unconfirmed routine when the scheduled
    // date is today or tomorrow (diffDays 0 or 1); a past date yields a negative
    // diff and is reported visible. The old "too late" bound was what kept that
    // branch unreachable, so opening the gate must not make an unconfirmed job
    // executable — that would bypass the AM/OP-only force-confirmation rule.
    vi.setSystemTime(zonedWallTimeToUtc('2026-03-22', '09:00', PLATFORM_TIMEZONE));

    appointmentRepo.findById.mockResolvedValue(
      makeAppointmentWithRelations(
        { rentalTenantConfirmationStatus: 'PENDING', keyRequired: false },
        ),
    );

    await expect(
      sut.execute({
        appointmentId: 'appt-1',
        latitude: -33.891,
        longitude: 151.277,
        idempotencyKey: 'key-unconfirmed-past',
        actor: inspActor,
      }),
    ).rejects.toThrow(ExecutionT1BlockedError);

    expect(executionRepo.save).not.toHaveBeenCalled();
  });

  it('should explain the confirmation blocker without internal rule jargon', async () => {
    // The inspector reaches this after walking the whole geolocation flow, and the
    // message is rendered verbatim in a snackbar. "T-1" named the rule, not the
    // problem, and was plain wrong for a job whose date already passed.
    const sut = makeSut();
    vi.setSystemTime(zonedWallTimeToUtc('2026-03-22', '09:00', PLATFORM_TIMEZONE));

    appointmentRepo.findById.mockResolvedValue(
      makeAppointmentWithRelations({ rentalTenantConfirmationStatus: 'PENDING' }),
    );

    await expect(
      sut.execute({
        appointmentId: 'appt-1',
        latitude: -33.891,
        longitude: 151.277,
        idempotencyKey: 'key-jargon',
        actor: inspActor,
      }),
    ).rejects.toThrow(/tenant has not confirmed/i);
  });

  it('should allow routine inspection without tenant confirmation if requiresRentalTenantConfirmation is false on serviceType', async () => {
    const sut = makeSut();
    vi.setSystemTime(zonedWallTimeToUtc('2026-03-22', '09:00', PLATFORM_TIMEZONE));

    serviceTypeReader.findById.mockResolvedValueOnce({
      id: 'st-1',
      code: 'ROUTINE_NO_CONF',
      name: 'Routine No Confirmation Required',
      flowType: 'ROUTINE',
      requiresRentalTenantConfirmation: false,
    });

    appointmentRepo.findById.mockResolvedValue(
      makeAppointmentWithRelations(
        { rentalTenantConfirmationStatus: 'PENDING', keyRequired: false },
      ),
    );

    const result = await sut.execute({
      appointmentId: 'appt-1',
      latitude: -33.891,
      longitude: 151.277,
      idempotencyKey: 'key-no-conf-flag',
      actor: inspActor,
    });

    expect(result.status).toBe('IN_PROGRESS');
    expect(executionRepo.save).toHaveBeenCalled();
  });

  it('should allow a past-date routine inspection once the tenant has confirmed', async () => {
    const sut = makeSut();
    vi.setSystemTime(zonedWallTimeToUtc('2026-03-22', '09:00', PLATFORM_TIMEZONE));

    appointmentRepo.findById.mockResolvedValue(
      makeAppointmentWithRelations(
        { rentalTenantConfirmationStatus: 'CONFIRMED' },
        ),
    );

    const result = await sut.execute({
      appointmentId: 'appt-1',
      latitude: -33.891,
      longitude: 151.277,
      idempotencyKey: 'key-confirmed-past',
      actor: inspActor,
    });

    expect(result.status).toBe('IN_PROGRESS');
  });

  it('should allow a past-date ingoing inspection, which never needs confirmation', async () => {
    const sut = makeSut();
    vi.setSystemTime(zonedWallTimeToUtc('2026-03-22', '09:00', PLATFORM_TIMEZONE));
    serviceTypeReader.findById.mockResolvedValue({ flowType: 'INGOING' });

    appointmentRepo.findById.mockResolvedValue(
      makeAppointmentWithRelations(
        { rentalTenantConfirmationStatus: 'PENDING' },
        ),
    );

    const result = await sut.execute({
      appointmentId: 'appt-1',
      latitude: -33.891,
      longitude: 151.277,
      idempotencyKey: 'key-ingoing-past',
      actor: inspActor,
    });

    expect(result.status).toBe('IN_PROGRESS');
  });

  it('should allow a past-date unconfirmed routine when a key is available', async () => {
    const sut = makeSut();
    vi.setSystemTime(zonedWallTimeToUtc('2026-03-22', '09:00', PLATFORM_TIMEZONE));

    appointmentRepo.findById.mockResolvedValue(
      makeAppointmentWithRelations(
        { rentalTenantConfirmationStatus: 'PENDING', keyRequired: true },
        ),
    );

    const result = await sut.execute({
      appointmentId: 'appt-1',
      latitude: -33.891,
      longitude: 151.277,
      idempotencyKey: 'key-keyreq-past',
      actor: inspActor,
    });

    expect(result.status).toBe('IN_PROGRESS');
  });

  it('should allow starting within the time slot', async () => {
    const sut = makeSut();
    vi.setSystemTime(zonedWallTimeToUtc('2026-03-21', '09:30', PLATFORM_TIMEZONE));

    appointmentRepo.findById.mockResolvedValue(makeAppointmentWithRelations());

    const result = await sut.execute({
      appointmentId: 'appt-1',
      latitude: -33.891,
      longitude: 151.277,
      idempotencyKey: 'key-tw-5',
      actor: inspActor,
    });

    expect(result.status).toBe('IN_PROGRESS');
    expect(result.appointmentId).toBe('appt-1');
  });

  // --- GAP-001: Geolocation verification at start ---

  it('should compute geolocationDistanceMeters when property has coordinates and inspector is within 500m', async () => {
    const sut = makeSut();
    // Property at Sydney Opera House: -33.8568, 151.2153
    // Inspector at ~200m away: -33.8550, 151.2153
    appointmentRepo.findById.mockResolvedValue(
      makeAppointmentWithRelations({}, { propertyLatitude: -33.8568, propertyLongitude: 151.2153 }),
    );

    const result = await sut.execute({
      appointmentId: 'appt-1',
      latitude: -33.8550,
      longitude: 151.2153,
      idempotencyKey: 'key-geo-1',
      actor: inspActor,
    });

    expect(result.geolocationDistanceMeters).toBeTypeOf('number');
    expect(result.geolocationDistanceMeters!).toBeLessThan(500);
    // No geolocation_mismatch audit entry
    const mismatchCalls = auditService.log.mock.calls.filter(
      (c: any[]) => c[0].action === 'inspection.geolocation_mismatch',
    );
    expect(mismatchCalls).toHaveLength(0);
  });

  it('should log geolocation_mismatch warning when inspector is beyond 500m from property', async () => {
    const sut = makeSut();
    // Property at Sydney Opera House: -33.8568, 151.2153
    // Inspector ~5km away: -33.8100, 151.2153
    appointmentRepo.findById.mockResolvedValue(
      makeAppointmentWithRelations({}, { propertyLatitude: -33.8568, propertyLongitude: 151.2153 }),
    );

    const result = await sut.execute({
      appointmentId: 'appt-1',
      latitude: -33.8100,
      longitude: 151.2153,
      idempotencyKey: 'key-geo-2',
      actor: inspActor,
    });

    expect(result.geolocationDistanceMeters).toBeTypeOf('number');
    expect(result.geolocationDistanceMeters!).toBeGreaterThan(500);
    // Should have geolocation_mismatch audit entry
    const mismatchCalls = auditService.log.mock.calls.filter(
      (c: any[]) => c[0].action === 'inspection.geolocation_mismatch',
    );
    expect(mismatchCalls).toHaveLength(1);
    expect(mismatchCalls[0][0].metadata.distanceMeters).toBeGreaterThan(500);
    expect(mismatchCalls[0][0].metadata.thresholdMeters).toBe(500);
  });

  it('should not block inspection start when inspector is beyond 500m', async () => {
    const sut = makeSut();
    appointmentRepo.findById.mockResolvedValue(
      makeAppointmentWithRelations({}, { propertyLatitude: -33.8568, propertyLongitude: 151.2153 }),
    );

    // Inspector is far away — should still succeed (non-blocking)
    const result = await sut.execute({
      appointmentId: 'appt-1',
      latitude: -34.0,
      longitude: 151.0,
      idempotencyKey: 'key-geo-3',
      actor: inspActor,
    });

    expect(result.status).toBe('IN_PROGRESS');
    expect(result.geolocationDistanceMeters).toBeGreaterThan(500);
  });

  it('should set geolocationDistanceMeters to null when property has no coordinates', async () => {
    const sut = makeSut();
    appointmentRepo.findById.mockResolvedValue(
      makeAppointmentWithRelations({}, { propertyLatitude: null, propertyLongitude: null }),
    );

    const result = await sut.execute({
      appointmentId: 'appt-1',
      latitude: -33.891,
      longitude: 151.277,
      idempotencyKey: 'key-geo-4',
      actor: inspActor,
    });

    expect(result.geolocationDistanceMeters).toBeNull();
    // No geolocation_mismatch audit entry
    const mismatchCalls = auditService.log.mock.calls.filter(
      (c: any[]) => c[0].action === 'inspection.geolocation_mismatch',
    );
    expect(mismatchCalls).toHaveLength(0);
  });

  it('should persist geolocationDistanceMeters on the execution entity', async () => {
    const sut = makeSut();
    appointmentRepo.findById.mockResolvedValue(
      makeAppointmentWithRelations({}, { propertyLatitude: -33.8568, propertyLongitude: 151.2153 }),
    );

    await sut.execute({
      appointmentId: 'appt-1',
      latitude: -33.8568,
      longitude: 151.2153,
      idempotencyKey: 'key-geo-5',
      actor: inspActor,
    });

    const savedExecution = executionRepo.save.mock.calls[0][0] as InspectionExecutionEntity;
    expect(savedExecution.geolocationDistanceMeters).toBeTypeOf('number');
    expect(savedExecution.geolocationDistanceMeters!).toBeLessThan(10); // same coords ~0m
  });
});
