import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SetRentalTenantAvailabilityUseCase } from '../../../src/modules/appointment/application/use-cases/set-rental-tenant-availability.use-case';
import type { IAppointmentRepository } from '../../../src/modules/appointment/domain/appointment.repository';
import { AppointmentEntity } from '../../../src/modules/appointment/domain/appointment.entity';
import { AppointmentRestrictionEntity } from '../../../src/modules/appointment/domain/appointment-restriction.entity';
import { AuthorizationService } from '../../../src/shared/domain/authorization.service';
import { ForbiddenError } from '../../../src/shared/domain/errors';
import { AppointmentNotFoundError, AppointmentInvalidTransitionError } from '../../../src/modules/appointment/domain/appointment.errors';
import { ConfirmationCycleNotFoundError } from '../../../src/modules/appointment/domain/confirmation-cycle.errors';
import type { AuthContext, AvailableSlot } from '@properfy/shared';
import type {
  IIdempotencyService,
  IdempotencyRecord,
} from '../../../src/shared/domain/idempotency.service';

const SLOTS: AvailableSlot[] = [{ dayOfWeek: 'MON', start: '09:00', end: '12:00' }];

function makeAppointment(overrides: Record<string, unknown> = {}) {
  return new AppointmentEntity({
    id: 'appt-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    propertyId: 'property-1',
    serviceTypeId: 'svc-1',
    inspectorId: null,
    status: 'SCHEDULED',
    scheduledDate: new Date('2026-09-01'),
    timeSlotStart: '09:00',
    timeSlotEnd: '10:00',
    keyRequired: false,
    meetingLocation: null,
    keyLocation: null,
    rentalTenantConfirmationStatus: 'PENDING',
    priceAmount: 150,
    payoutAmount: 80,
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
  } as ConstructorParameters<typeof AppointmentEntity>[0]);
}

function makeActor(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    userId: 'user-1',
    tenantId: null,
    role: 'AM',
    branchId: null,
    inspectorId: null,
    ...overrides,
  } as AuthContext;
}

describe('SetRentalTenantAvailabilityUseCase', () => {
  let appointmentRepo: IAppointmentRepository;
  let auditService: { log: ReturnType<typeof vi.fn> };
  let statusTransition: { execute: ReturnType<typeof vi.fn> };
  let cycleService: { markUnavailable: ReturnType<typeof vi.fn> };
  let idempotencyService: IIdempotencyService;
  let idempotencyRecords: Map<string, IdempotencyRecord>;
  let useCase: SetRentalTenantAvailabilityUseCase;

  function build(restrictions: AppointmentRestrictionEntity[] = []) {
    vi.mocked(appointmentRepo.findById).mockResolvedValue({
      appointment: makeAppointment(),
      contact: null,
      contacts: [],
      restrictions,
      propertyAddress: '1 Test St',
      serviceTypeName: 'Routine',
      hasActivePortalToken: false,
    } as never);
  }

  beforeEach(() => {
    appointmentRepo = {
      findById: vi.fn(),
      update: vi.fn(),
      replaceRestrictions: vi.fn(),
    } as unknown as IAppointmentRepository;
    auditService = { log: vi.fn() };
    statusTransition = { execute: vi.fn().mockResolvedValue({}) };
    cycleService = { markUnavailable: vi.fn().mockResolvedValue({}) };
    idempotencyRecords = new Map();
    idempotencyService = {
      get: vi.fn(),
      getWithHash: vi.fn(async (key: string) => idempotencyRecords.get(key) ?? null),
      tryAcquire: vi.fn(async (key: string, _scope: string, payloadHash: string) => {
        const existing = idempotencyRecords.get(key);
        if (!existing) {
          idempotencyRecords.set(key, {
            response: { __idempotencyState: 'IN_PROGRESS', ownerToken: `owner:${key}` },
            payloadHash,
          });
          return { status: 'acquired' as const, ownerToken: `owner:${key}` };
        }
        if ((existing.response as { __idempotencyState?: string }).__idempotencyState === 'IN_PROGRESS') {
          return { status: 'in_progress' as const, payloadHash: existing.payloadHash };
        }
        return {
          status: 'completed' as const,
          response: existing.response,
          payloadHash: existing.payloadHash,
        };
      }),
      complete: vi.fn(async (key: string, _scope: string, ownerToken: string, response: unknown, _ttl: number, payloadHash: string) => {
        const existing = idempotencyRecords.get(key);
        if ((existing?.response as { ownerToken?: string })?.ownerToken !== ownerToken) return false;
        idempotencyRecords.set(key, { response, payloadHash });
        return true;
      }),
      renew: vi.fn(async (key: string, _scope: string, _payloadHash: string, ownerToken: string) => {
        const existing = idempotencyRecords.get(key);
        return (existing?.response as { ownerToken?: string })?.ownerToken === ownerToken;
      }),
      release: vi.fn(async (key: string, _scope: string, _payloadHash: string, ownerToken: string) => {
        const existing = idempotencyRecords.get(key);
        if ((existing?.response as { ownerToken?: string })?.ownerToken === ownerToken) {
          idempotencyRecords.delete(key);
        }
      }),
      set: vi.fn(async (key: string, _scope: string, response: unknown, _ttl: number, payloadHash?: string) => {
        idempotencyRecords.set(key, { response, payloadHash: payloadHash ?? null });
      }),
    };
    useCase = new SetRentalTenantAvailabilityUseCase(
      appointmentRepo,
      auditService as never,
      new AuthorizationService({ log: vi.fn() } as never),
      statusTransition as never,
      idempotencyService,
      cycleService as never,
    );
  });

  describe('who may record availability', () => {
    it.each(['AM', 'OP'] as const)('allows %s', async (role) => {
      build();
      await expect(
        useCase.execute({
          appointmentId: 'appt-1',
          availableSlots: SLOTS,
          markUnavailable: false,
          actor: makeActor({ role }),
        }),
      ).resolves.toBeTruthy();
    });

    it('allows CL_ADMIN on their own tenant', async () => {
      build();
      await expect(
        useCase.execute({
          appointmentId: 'appt-1',
          availableSlots: SLOTS,
          markUnavailable: false,
          actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
        }),
      ).resolves.toBeTruthy();
    });

    it.each(['CL_USER', 'INSP', 'TNT'] as const)('denies %s', async (role) => {
      build();
      await expect(
        useCase.execute({
          appointmentId: 'appt-1',
          availableSlots: SLOTS,
          markUnavailable: false,
          actor: makeActor({ role, tenantId: 'tenant-1' }),
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it("hides another agency's appointment from a CL_ADMIN", async () => {
      build();
      await expect(
        useCase.execute({
          appointmentId: 'appt-1',
          availableSlots: SLOTS,
          markUnavailable: false,
          actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-OTHER' }),
        }),
      ).rejects.toThrow(AppointmentNotFoundError);
    });
  });

  /**
   * There is at most ONE restriction row per appointment and `replaceRestrictions`
   * overwrites it wholesale, so writing availability must carry the operator's
   * fields across or it silently deletes them.
   */
  describe('preserving the other owner of the restriction row', () => {
    it('keeps the operator fields and only swaps the slots', async () => {
      build([
        new AppointmentRestrictionEntity({
          id: 'r-1',
          appointmentId: 'appt-1',
          isHome: true,
          unavailableDaysJson: ['2026-09-05'],
          unavailableHoursJson: ['09:00-10:00'],
          availableSlotsJson: null,
          notes: 'Dog in backyard',
          source: 'OPERATOR',
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ]);

      await useCase.execute({
        appointmentId: 'appt-1',
        availableSlots: SLOTS,
        markUnavailable: false,
        actor: makeActor({ role: 'OP' }),
      });

      const written = vi.mocked(appointmentRepo.replaceRestrictions).mock.calls[0]![1]!;
      expect(written.availableSlotsJson).toEqual(SLOTS);
      expect(written.isHome).toBe(true);
      expect(written.notes).toBe('Dog in backyard');
      expect(written.unavailableDaysJson).toEqual(['2026-09-05']);
      // Reusing the row id keeps createdAt and avoids churning the PK.
      expect(written.id).toBe('r-1');
      // Source must survive: the edit drawer decides whether to show its
      // "Add access restriction" toggle from it.
      expect(written.source).toBe('OPERATOR');
    });

    it('creates a portal-sourced row when the appointment has no restriction yet', async () => {
      build([]);

      await useCase.execute({
        appointmentId: 'appt-1',
        availableSlots: SLOTS,
        markUnavailable: false,
        actor: makeActor({ role: 'AM' }),
      });

      const written = vi.mocked(appointmentRepo.replaceRestrictions).mock.calls[0]![1]!;
      expect(written.availableSlotsJson).toEqual(SLOTS);
      // NOT 'OPERATOR': AppointmentFormDrawer derives `hasRestriction` from
      // "a row whose source is not RENTAL_TENANT_PORTAL", so stamping OPERATOR
      // here would switch the operator's restriction toggle on by itself.
      expect(written.source).toBe('RENTAL_TENANT_PORTAL');
      expect(written.isHome).toBe(false);
      expect(written.notes).toBeNull();
    });
  });

  describe('markUnavailable', () => {
    it('leaves both statuses alone when not requested', async () => {
      build();

      await useCase.execute({
        appointmentId: 'appt-1',
        availableSlots: SLOTS,
        markUnavailable: false,
        actor: makeActor({ role: 'OP' }),
      });

      expect(cycleService.markUnavailable).not.toHaveBeenCalled();
      expect(statusTransition.execute).not.toHaveBeenCalled();
    });

    it('marks the tenant unavailable and rejects as TENANT_DECLINED when requested', async () => {
      build();

      await useCase.execute({
        appointmentId: 'appt-1',
        availableSlots: SLOTS,
        markUnavailable: true,
        idempotencyKey: 'decline-1',
        actor: makeActor({ role: 'OP' }),
      });

      expect(cycleService.markUnavailable).toHaveBeenCalledWith('appt-1', 'tenant-1');
      expect(statusTransition.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          appointmentId: 'appt-1',
          targetStatus: 'REJECTED',
          rejectionReasonCode: 'TENANT_DECLINED',
        }),
      );
    });

    it('attributes the rejection to the operator, not to SYS', async () => {
      build();

      await useCase.execute({
        appointmentId: 'appt-1',
        availableSlots: SLOTS,
        markUnavailable: true,
        idempotencyKey: 'decline-2',
        actor: makeActor({ role: 'OP', userId: 'op-7' }),
      });

      expect(statusTransition.execute).toHaveBeenCalledWith(
        expect.objectContaining({ actor: expect.objectContaining({ userId: 'op-7', role: 'OP' }) }),
      );
    });

    it('replays a completed decline when the same idempotency key is retried', async () => {
      build();

      const input = {
        appointmentId: 'appt-1',
        availableSlots: SLOTS,
        markUnavailable: true,
        idempotencyKey: 'req-abc',
        actor: makeActor({ role: 'OP' }),
      } as const;

      await useCase.execute(input);

      vi.mocked(appointmentRepo.findById).mockResolvedValue({
        appointment: makeAppointment({
          status: 'REJECTED',
          rentalTenantConfirmationStatus: 'UNAVAILABLE',
        }),
        contact: null,
        contacts: [],
        restrictions: [
          new AppointmentRestrictionEntity({
            id: 'r-1',
            appointmentId: 'appt-1',
            isHome: false,
            unavailableDaysJson: null,
            unavailableHoursJson: null,
            availableSlotsJson: SLOTS,
            notes: null,
            source: 'RENTAL_TENANT_PORTAL',
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        ],
        propertyAddress: '1 Test St',
        serviceTypeName: 'Routine',
        hasActivePortalToken: false,
      } as never);

      await expect(useCase.execute(input)).resolves.toEqual({
        id: 'appt-1',
        availableSlots: SLOTS,
        rentalTenantConfirmationStatus: 'UNAVAILABLE',
      });
      expect(statusTransition.execute).toHaveBeenCalledTimes(1);
    });

    it('recovers an expired reservation after the decline business state committed', async () => {
      build();
      const input = {
        appointmentId: 'appt-1',
        availableSlots: SLOTS,
        markUnavailable: true,
        idempotencyKey: 'req-expired-after-commit',
        actor: makeActor({ role: 'OP' }),
      } as const;

      await useCase.execute(input);
      idempotencyRecords.clear();
      vi.mocked(appointmentRepo.findById).mockResolvedValue({
        appointment: makeAppointment({
          status: 'REJECTED',
          rentalTenantConfirmationStatus: 'UNAVAILABLE',
        }),
        contact: null,
        contacts: [],
        restrictions: [new AppointmentRestrictionEntity({
          id: 'r-1',
          appointmentId: 'appt-1',
          isHome: false,
          unavailableDaysJson: null,
          unavailableHoursJson: null,
          availableSlotsJson: SLOTS,
          notes: null,
          source: 'RENTAL_TENANT_PORTAL',
          createdAt: new Date(),
          updatedAt: new Date(),
        })],
        propertyAddress: '1 Test St',
        serviceTypeName: 'Routine',
        hasActivePortalToken: false,
      } as never);

      await expect(useCase.execute(input)).resolves.toEqual({
        id: 'appt-1',
        availableSlots: SLOTS,
        rentalTenantConfirmationStatus: 'UNAVAILABLE',
      });
      expect(appointmentRepo.replaceRestrictions).toHaveBeenCalledTimes(1);
      expect(cycleService.markUnavailable).toHaveBeenCalledTimes(1);
      expect(statusTransition.execute).toHaveBeenCalledTimes(1);
    });

    it('allows only one concurrent request with the same key to perform side effects', async () => {
      build();
      let unblockWrite!: () => void;
      const writeBlocked = new Promise<void>((resolve) => { unblockWrite = resolve; });
      let writeStarted!: () => void;
      const started = new Promise<void>((resolve) => { writeStarted = resolve; });
      vi.mocked(appointmentRepo.replaceRestrictions).mockImplementationOnce(async () => {
        writeStarted();
        await writeBlocked;
      });
      const input = {
        appointmentId: 'appt-1',
        availableSlots: SLOTS,
        markUnavailable: true,
        idempotencyKey: 'req-concurrent',
        actor: makeActor({ role: 'OP' }),
      } as const;

      const first = useCase.execute(input);
      await started;
      await expect(useCase.execute(input)).rejects.toMatchObject({
        code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
      });
      unblockWrite();
      await first;

      expect(appointmentRepo.replaceRestrictions).toHaveBeenCalledTimes(1);
      expect(cycleService.markUnavailable).toHaveBeenCalledTimes(1);
      expect(statusTransition.execute).toHaveBeenCalledTimes(1);
      expect(auditService.log).toHaveBeenCalledTimes(1);
    });

    it('namespaces the persisted key by principal even when raw keys match', async () => {
      build();
      const base = {
        appointmentId: 'appt-1',
        availableSlots: SLOTS,
        markUnavailable: true,
        idempotencyKey: 'same-client-key',
      } as const;

      await useCase.execute({ ...base, actor: makeActor({ role: 'OP', userId: 'op-1' }) });
      await useCase.execute({ ...base, actor: makeActor({ role: 'OP', userId: 'op-2' }) });

      const acquiredKeys = vi.mocked(idempotencyService.tryAcquire).mock.calls.map(([key]) => key);
      expect(acquiredKeys).toHaveLength(2);
      expect(new Set(acquiredKeys).size).toBe(2);
    });

    it('stops before the status transition when the reservation lease is lost', async () => {
      build();
      vi.mocked(idempotencyService.renew)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      await expect(useCase.execute({
        appointmentId: 'appt-1',
        availableSlots: SLOTS,
        markUnavailable: true,
        idempotencyKey: 'req-lost-lease',
        actor: makeActor({ role: 'OP' }),
      })).rejects.toMatchObject({ code: 'IDEMPOTENCY_REQUEST_IN_PROGRESS' });

      expect(appointmentRepo.replaceRestrictions).toHaveBeenCalledTimes(1);
      expect(cycleService.markUnavailable).toHaveBeenCalledTimes(1);
      expect(statusTransition.execute).not.toHaveBeenCalled();
      expect(auditService.log).not.toHaveBeenCalled();
    });

    it('rejects reuse of an idempotency key with different slots', async () => {
      build();
      const base = {
        appointmentId: 'appt-1',
        markUnavailable: true,
        idempotencyKey: 'req-abc',
        actor: makeActor({ role: 'OP' }),
      } as const;

      await useCase.execute({ ...base, availableSlots: SLOTS });

      await expect(useCase.execute({
        ...base,
        availableSlots: [{ dayOfWeek: 'TUE', start: '10:00', end: '12:00' }],
      })).rejects.toMatchObject({ code: 'IDEMPOTENCY_PAYLOAD_MISMATCH' });
      expect(statusTransition.execute).toHaveBeenCalledTimes(1);
    });

    it('recovers when the transition completed before the command cache write failed', async () => {
      const initialResult = {
        appointment: makeAppointment(),
        contact: null,
        contacts: [],
        restrictions: [],
        propertyAddress: '1 Test St',
        serviceTypeName: 'Routine',
        hasActivePortalToken: false,
      } as never;
      const completedResult = {
        appointment: makeAppointment({
          status: 'REJECTED',
          rentalTenantConfirmationStatus: 'UNAVAILABLE',
        }),
        contact: null,
        contacts: [],
        restrictions: [
          new AppointmentRestrictionEntity({
            id: 'r-1',
            appointmentId: 'appt-1',
            isHome: false,
            unavailableDaysJson: null,
            unavailableHoursJson: null,
            availableSlotsJson: SLOTS,
            notes: null,
            source: 'RENTAL_TENANT_PORTAL',
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        ],
        propertyAddress: '1 Test St',
        serviceTypeName: 'Routine',
        hasActivePortalToken: false,
      } as never;
      vi.mocked(appointmentRepo.findById)
        .mockResolvedValueOnce(initialResult)
        .mockResolvedValueOnce(completedResult);
      vi.mocked(idempotencyService.complete)
        .mockRejectedValueOnce(new Error('cache write failed'))
        .mockImplementationOnce(async (key, _scope, _ownerToken, response, _ttl, payloadHash) => {
          idempotencyRecords.set(key, { response, payloadHash: payloadHash ?? null });
          return true;
        });
      const input = {
        appointmentId: 'appt-1',
        availableSlots: SLOTS,
        markUnavailable: true,
        idempotencyKey: 'req-recover',
        actor: makeActor({ role: 'OP' }),
      } as const;

      await expect(useCase.execute(input)).resolves.toMatchObject({
        id: 'appt-1',
        rentalTenantConfirmationStatus: 'UNAVAILABLE',
      });
      expect(appointmentRepo.replaceRestrictions).toHaveBeenCalledTimes(1);
      expect(auditService.log).toHaveBeenCalledTimes(1);
      expect(statusTransition.execute).toHaveBeenCalledTimes(1);
    });

    it('recovers when the transition persisted before its own cache write failed', async () => {
      const initialResult = {
        appointment: makeAppointment(),
        contact: null,
        contacts: [],
        restrictions: [],
        propertyAddress: '1 Test St',
        serviceTypeName: 'Routine',
        hasActivePortalToken: false,
      } as never;
      const completedResult = {
        appointment: makeAppointment({
          status: 'REJECTED',
          rentalTenantConfirmationStatus: 'UNAVAILABLE',
        }),
        contact: null,
        contacts: [],
        restrictions: [
          new AppointmentRestrictionEntity({
            id: 'r-1',
            appointmentId: 'appt-1',
            isHome: false,
            unavailableDaysJson: null,
            unavailableHoursJson: null,
            availableSlotsJson: SLOTS,
            notes: null,
            source: 'RENTAL_TENANT_PORTAL',
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        ],
        propertyAddress: '1 Test St',
        serviceTypeName: 'Routine',
        hasActivePortalToken: false,
      } as never;
      vi.mocked(appointmentRepo.findById)
        .mockResolvedValueOnce(initialResult)
        .mockResolvedValueOnce(completedResult);
      statusTransition.execute.mockRejectedValueOnce(new Error('transition cache unavailable'));

      await expect(useCase.execute({
        appointmentId: 'appt-1',
        availableSlots: SLOTS,
        markUnavailable: true,
        idempotencyKey: 'req-inner-cache',
        actor: makeActor({ role: 'OP' }),
      })).resolves.toMatchObject({
        id: 'appt-1',
        rentalTenantConfirmationStatus: 'UNAVAILABLE',
      });

      expect(appointmentRepo.replaceRestrictions).toHaveBeenCalledTimes(1);
      expect(statusTransition.execute).toHaveBeenCalledTimes(1);
      expect(auditService.log).toHaveBeenCalledTimes(1);
    });

    it('requires an idempotency key before writing a decline', async () => {
      build();

      await expect(useCase.execute({
        appointmentId: 'appt-1',
        availableSlots: SLOTS,
        markUnavailable: true,
        actor: makeActor({ role: 'OP' }),
      })).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REQUIRED' });
      expect(appointmentRepo.replaceRestrictions).not.toHaveBeenCalled();
    });

    it('falls back to a direct write when there is no active confirmation cycle', async () => {
      build();
      cycleService.markUnavailable.mockRejectedValueOnce(new ConfirmationCycleNotFoundError());

      await useCase.execute({
        appointmentId: 'appt-1',
        availableSlots: SLOTS,
        markUnavailable: true,
        idempotencyKey: 'decline-fallback',
        actor: makeActor({ role: 'AM' }),
      });

      expect(appointmentRepo.update).toHaveBeenCalledWith(
        'appt-1',
        'tenant-1',
        expect.objectContaining({ rentalTenantConfirmationStatus: 'UNAVAILABLE' }),
      );
    });

    it('propagates an infrastructure failure instead of silently denormalising', async () => {
      // A broad catch here would write UNAVAILABLE onto the appointment while the
      // cycle it mirrors stayed untouched — two sources of truth disagreeing,
      // with nothing logged. Only the pre-feature "no cycle" case may fall back.
      build();
      cycleService.markUnavailable.mockRejectedValueOnce(new Error('connection reset'));

      await expect(
        useCase.execute({
          appointmentId: 'appt-1',
          availableSlots: SLOTS,
          markUnavailable: true,
          idempotencyKey: 'decline-infra-failure',
          actor: makeActor({ role: 'AM' }),
        }),
      ).rejects.toThrow('connection reset');

      expect(appointmentRepo.update).not.toHaveBeenCalled();
      expect(statusTransition.execute).not.toHaveBeenCalled();
    });

    it('denies CL_ADMIN the reject path even though they may record availability', async () => {
      build();

      await expect(
        useCase.execute({
          appointmentId: 'appt-1',
          availableSlots: SLOTS,
          markUnavailable: true,
          actor: makeActor({ role: 'CL_ADMIN', tenantId: 'tenant-1' }),
        }),
      ).rejects.toThrow(ForbiddenError);

      // Nothing may be written on the denied path — a partial write would leave
      // the slots saved with the operator believing the decline also landed.
      expect(appointmentRepo.replaceRestrictions).not.toHaveBeenCalled();
    });

    it.each(['DONE', 'CANCELLED', 'REJECTED', 'DRAFT'] as const)(
      'refuses to decline an appointment already in %s',
      async (status) => {
        vi.mocked(appointmentRepo.findById).mockResolvedValue({
          appointment: makeAppointment({ status }),
          contact: null,
          contacts: [],
          restrictions: [],
          propertyAddress: '1 Test St',
          serviceTypeName: 'Routine',
          hasActivePortalToken: false,
        } as never);

        await expect(
          useCase.execute({
            appointmentId: 'appt-1',
            availableSlots: SLOTS,
            markUnavailable: true,
            idempotencyKey: `decline-terminal-${status}`,
            actor: makeActor({ role: 'AM' }),
          }),
        ).rejects.toThrow(AppointmentInvalidTransitionError);
        expect(statusTransition.execute).not.toHaveBeenCalled();
      },
    );

    it('still records availability on a terminal appointment when not declining', async () => {
      // Availability is just data — an operator may log what the tenant said
      // even after the inspection was rejected.
      vi.mocked(appointmentRepo.findById).mockResolvedValue({
        appointment: makeAppointment({ status: 'REJECTED' }),
        contact: null,
        contacts: [],
        restrictions: [],
        propertyAddress: '1 Test St',
        serviceTypeName: 'Routine',
        hasActivePortalToken: false,
      } as never);

      await expect(
        useCase.execute({
          appointmentId: 'appt-1',
          availableSlots: SLOTS,
          markUnavailable: false,
          actor: makeActor({ role: 'AM' }),
        }),
      ).resolves.toBeTruthy();
      expect(appointmentRepo.replaceRestrictions).toHaveBeenCalled();
    });
  });

  it('audits the write with the actor who made it', async () => {
    build();

    await useCase.execute({
      appointmentId: 'appt-1',
      availableSlots: SLOTS,
      markUnavailable: false,
      actor: makeActor({ role: 'OP', userId: 'op-7' }),
    });

    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'appointment.rental_tenant_availability_set',
        actorType: 'USER',
        actorId: 'op-7',
        entityId: 'appt-1',
        tenantId: 'tenant-1',
      }),
    );
  });
});
