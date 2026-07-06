/**
 * Integration tests for TZ-aware past-date/time validation across the
 * 7 appointment/service-group use cases (cycle 6).
 *
 * Uses vi.useFakeTimers to freeze time so assertions are deterministic.
 * TZ = 'Australia/Sydney' (AEST UTC+10 in June) to exercise the TZ path.
 *
 * Only representative cases are covered here. Full matrix is in the
 * shared edit-date-validation.test.ts unit suite.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CreateAppointmentUseCase } from '../../../src/modules/appointment/application/use-cases/create-appointment.use-case';
import { UpdateAppointmentUseCase } from '../../../src/modules/appointment/application/use-cases/update-appointment.use-case';
import { AppointmentDateInPastError, AppointmentTimeInPastError } from '../../../src/modules/appointment/domain/appointment.errors';
import { CreateServiceGroupUseCase } from '../../../src/modules/service-group/application/use-cases/create-service-group.use-case';
import { ServiceGroupDateInPastError, ServiceGroupTimeInPastError } from '../../../src/modules/service-group/domain/service-group.errors';
import type { AuthContext } from '@properfy/shared';
import type { IAppointmentRepository } from '../../../src/modules/appointment/domain/appointment.repository';
import type { IServiceGroupRepository } from '../../../src/modules/service-group/domain/service-group.repository';

// Frozen clock: 2026-06-15T09:00:00Z = 2026-06-15 19:00 AEST
const FROZEN = new Date('2026-06-15T09:00:00.000Z');
const TZ = 'Australia/Sydney';
const TODAY = '2026-06-15'; // same calendar day in AEST at 19:00
const PAST = '2026-06-10';
const FUTURE = '2026-06-20';

beforeEach(() => vi.useFakeTimers({ now: FROZEN }));
afterEach(() => vi.useRealTimers());

const actorOp: AuthContext = { userId: 'op-1', tenantId: 'tenant-1', role: 'OP', branchId: null, inspectorId: null };

// ─── Minimal mock factories ────────────────────────────────────────────────

function makeAuthService() {
  return { assertRoles: vi.fn(), assertClUserPermission: vi.fn() } as any;
}

function makeAppointmentRepo(overrides: Partial<IAppointmentRepository> = {}): IAppointmentRepository {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findByBranchId: vi.fn().mockResolvedValue([]),
    save: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    findAll: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as IAppointmentRepository;
}

// ─── create-appointment ────────────────────────────────────────────────────

describe('CreateAppointmentUseCase — TZ-aware date validation', () => {
  function makeUseCase() {
    const branchRepo = { findById: vi.fn().mockResolvedValue({ branch: { id: 'br-1', tenantId: 'tenant-1', status: 'ACTIVE' } }) };
    const propertyRepo = { findById: vi.fn().mockResolvedValue({ property: { id: 'prop-1', tenantId: 'tenant-1', latitude: 0, longitude: 0, addressString: '' } }) };
    const serviceTypeRepo = { findById: vi.fn().mockResolvedValue({ id: 'svc-1', tenantId: 'tenant-1', status: 'ACTIVE' }) };
    const pricingRuleRepo = { findAll: vi.fn().mockResolvedValue({ items: [], total: 0 }) };
    const auditService = { log: vi.fn() };
    const authService = makeAuthService();
    const appointmentRepo = makeAppointmentRepo();

    // Constructor: appointmentRepo, branchRepo, propertyRepo, serviceTypeRepo, pricingRuleRepo,
    // createPropertyUseCase, auditService, authorizationService, tenantRepo?, timeSlotRepo?, contactRepo?
    return new CreateAppointmentUseCase(
      appointmentRepo as any,
      branchRepo as any,
      propertyRepo as any,
      serviceTypeRepo as any,
      pricingRuleRepo as any,
      null as any, // createPropertyUseCase
      auditService as any,
      authService,
    );
  }

  const baseInput = {
    branchId: 'br-1',
    propertyId: 'prop-1',
    serviceTypeId: 'svc-1',
    timeSlotStart: '09:00', timeSlotEnd: '10:00',
    contacts: [{ contactId: 'c-1', role: 'PRIMARY', isPrimary: true }],
    keyRequired: false,
    actorTimezone: TZ,
    actor: actorOp,
  };

  it('should throw AppointmentDateInPastError for a past date', async () => {
    const uc = makeUseCase();
    await expect(uc.execute({ ...baseInput, scheduledDate: PAST }))
      .rejects.toThrow(AppointmentDateInPastError);
  });

  it('should throw AppointmentTimeInPastError for today + already-passed slot', async () => {
    const uc = makeUseCase();
    // At 19:00 AEST, slot 09:00-10:00 is already past.
    await expect(uc.execute({ ...baseInput, scheduledDate: TODAY, timeSlotStart: '09:00', timeSlotEnd: '10:00' }))
      .rejects.toThrow(AppointmentTimeInPastError);
  });

  it('should pass through for today + future slot (pricing is checked after, will throw, but not date)', async () => {
    const uc = makeUseCase();
    // Slot 20:00-21:00 is in the future at 19:00 AEST.
    await expect(uc.execute({ ...baseInput, scheduledDate: TODAY, timeSlotStart: '20:00', timeSlotEnd: '21:00' }))
      .rejects.not.toThrow(AppointmentDateInPastError);
    await expect(uc.execute({ ...baseInput, scheduledDate: TODAY, timeSlotStart: '20:00', timeSlotEnd: '21:00' }))
      .rejects.not.toThrow(AppointmentTimeInPastError);
  });

  it('should pass through for a future date (pricing is checked after, not date error)', async () => {
    const uc = makeUseCase();
    await expect(uc.execute({ ...baseInput, scheduledDate: FUTURE }))
      .rejects.not.toThrow(AppointmentDateInPastError);
  });
});

// ─── update-appointment ────────────────────────────────────────────────────

describe('UpdateAppointmentUseCase — TZ-aware date validation', () => {
  function makeUseCase(existingDate: string, existingSlot = '09:00-10:00') {
    const appointmentRepo = makeAppointmentRepo({
      findById: vi.fn().mockResolvedValue({
        appointment: {
          id: 'appt-1', tenantId: 'tenant-1', branchId: 'br-1', status: 'DRAFT',
          scheduledDate: new Date(`${existingDate}T00:00:00.000Z`),
          timeSlot: existingSlot,
          isEditable: () => true,
          isScheduleEditable: () => true,
          isDeleted: () => false,
        },
        contact: null, contacts: [], restrictions: [],
      }),
    });
    const auditService = { log: vi.fn() };
    const authService = makeAuthService();

    // Constructor: appointmentRepo, auditService, authorizationService, tenantRepo?, timeSlotRepo?, contactRepo?
    return new UpdateAppointmentUseCase(
      appointmentRepo as any,
      auditService as any,
      authService,
    );
  }

  it('should throw AppointmentDateInPastError when moving to a past date', async () => {
    const uc = makeUseCase(FUTURE);
    await expect(uc.execute({ appointmentId: 'appt-1', data: { scheduledDate: PAST }, actorTimezone: TZ, actor: actorOp }))
      .rejects.toThrow(AppointmentDateInPastError);
  });

  it('should ok if date unchanged (no date/time change — validateEditedSchedule skips)', async () => {
    const uc = makeUseCase(PAST); // existing date is past — but we are not changing it
    await expect(uc.execute({ appointmentId: 'appt-1', data: { keyRequired: true }, actorTimezone: TZ, actor: actorOp }))
      .resolves.toBeDefined();
  });
});

// ─── create-service-group (representative) ─────────────────────────────────

describe('CreateServiceGroupUseCase — TZ-aware date validation', () => {
  function makeUseCase() {
    const appointmentRepo = makeAppointmentRepo({
      findById: vi.fn().mockResolvedValue({
        appointment: { id: 'a-1', tenantId: 'tenant-1', serviceTypeId: 'svc-1', status: 'DRAFT', serviceGroupId: null, appointmentNumber: 1 },
      }),
    });
    const groupRepo = {
      save: vi.fn().mockResolvedValue(undefined),
      linkAppointments: vi.fn().mockResolvedValue(undefined),
    } as unknown as IServiceGroupRepository;
    const serviceRegionRepo = { findById: vi.fn() };
    const tenantRepo = { findById: vi.fn().mockResolvedValue({ tenant: { id: 'tenant-1' } }) };
    const auditService = { log: vi.fn() };
    const authService = makeAuthService();

    // Constructor: serviceGroupRepo, appointmentRepo, auditService, authorizationService, serviceRegionRepo?, tenantRepo?, clock?
    return new CreateServiceGroupUseCase(
      groupRepo,
      appointmentRepo as any,
      auditService as any,
      authService,
      serviceRegionRepo as any,
      tenantRepo as any,
    );
  }

  it('should throw ServiceGroupDateInPastError for a past date', async () => {
    const uc = makeUseCase();
    await expect(uc.execute({
      appointmentIds: ['a-1'], serviceTypeId: 'svc-1',
      scheduledDate: PAST, timeWindow: '09:00-17:00',
    })).rejects.toThrow(ServiceGroupDateInPastError);
  });

  it('should throw ServiceGroupTimeInPastError for today + past time window', async () => {
    const uc = makeUseCase();
    await expect(uc.execute({
      appointmentIds: ['a-1'], serviceTypeId: 'svc-1',
      scheduledDate: TODAY, timeWindow: '09:00-10:00',
    })).rejects.toThrow(ServiceGroupTimeInPastError);
  });
});
