import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  FindFyAppointmentsByPhoneUseCase,
  phoneDigitVariants,
} from '../../../src/modules/fy/application/use-cases/find-fy-appointments-by-phone.use-case';
import { GetFyAppointmentUseCase } from '../../../src/modules/fy/application/use-cases/get-fy-appointment.use-case';
import { GetFyAgencyUseCase } from '../../../src/modules/fy/application/use-cases/get-fy-agency.use-case';
import { GetFyAvailableDatesUseCase } from '../../../src/modules/fy/application/use-cases/get-fy-available-dates.use-case';
import { AddFyAppointmentNoteUseCase } from '../../../src/modules/fy/application/use-cases/add-fy-appointment-note.use-case';
import { ResendFyNoticeUseCase } from '../../../src/modules/fy/application/use-cases/resend-fy-notice.use-case';
import {
  AgencyNotFoundError,
  NoActiveAppointmentsError,
  NoticePeriodViolationError,
} from '../../../src/modules/fy/domain/fy.errors';
import { formatAppointmentCode } from '../../../src/modules/fy/domain/fy.repository';
import { AppointmentNotFoundError } from '../../../src/modules/appointment/domain/appointment.errors';
import { ConflictError, ValidationError } from '../../../src/shared/domain/errors';

const actor = {
  userId: 'api-key:k-1',
  tenantId: null,
  role: 'OP',
  branchId: null,
  inspectorId: null,
  scopes: ['bot:fy'],
} as any;

const auditService = { log: vi.fn() } as any;

beforeEach(() => vi.clearAllMocks());

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a0000000-0000-4000-8000-000000000001',
    appointmentNumber: 42,
    appointmentCodePrefix: 'INS',
    status: 'SCHEDULED',
    scheduledDate: new Date('2026-08-10T00:00:00Z'),
    timeSlotStart: '09:00',
    timeSlotEnd: '12:00',
    serviceTypeId: 'b0000000-0000-4000-8000-000000000001',
    serviceTypeName: 'Routine Inspection',
    propertyAddress: '12 George St, Sydney NSW 2000',
    tenantId: 'c0000000-0000-4000-8000-000000000001',
    tenantName: 'Belle Property',
    ...overrides,
  };
}

describe('phoneDigitVariants / formatAppointmentCode', () => {
  it('produces the +61 and 0-prefixed digit forms', () => {
    expect(phoneDigitVariants('+61412345678')).toEqual(['61412345678', '0412345678']);
  });

  it('formats codes with the tenant prefix and INS fallback', () => {
    expect(formatAppointmentCode('ABC', 7)).toBe('ABC-0007');
    expect(formatAppointmentCode(null, 1234)).toBe('INS-1234');
  });
});

describe('FindFyAppointmentsByPhoneUseCase', () => {
  it('normalises local numbers and returns summaries', async () => {
    const fyRepo = {
      findAppointmentsByContactPhone: vi.fn(async () => ({
        contact: { name: 'John Smith', email: 'j@x.com', phone: '0412 345 678' },
        appointments: [makeRow()],
      })),
    } as any;

    const result = await new FindFyAppointmentsByPhoneUseCase(fyRepo).execute({
      phone: '0412 345 678',
    });

    expect(fyRepo.findAppointmentsByContactPhone).toHaveBeenCalledWith({
      phoneDigitVariants: ['61412345678', '0412345678'],
      statuses: ['AWAITING_INSPECTOR', 'SCHEDULED'],
      doneWithinHours: 48,
    });
    expect(result.appointments[0]).toMatchObject({
      code: 'INS-0042',
      status: 'SCHEDULED',
      scheduledDate: '2026-08-10',
      agency: { name: 'Belle Property' },
    });
  });

  it('honours an explicit statusIn without the DONE grace window', async () => {
    const fyRepo = {
      findAppointmentsByContactPhone: vi.fn(async () => ({
        contact: { name: 'J', email: null, phone: null },
        appointments: [makeRow({ status: 'DONE' })],
      })),
    } as any;

    await new FindFyAppointmentsByPhoneUseCase(fyRepo).execute({
      phone: '+61412345678',
      statusIn: ['DONE'],
    });
    expect(fyRepo.findAppointmentsByContactPhone).toHaveBeenCalledWith(
      expect.objectContaining({ statuses: ['DONE'], doneWithinHours: 0 }),
    );
  });

  it('400 on invalid phone, 404 when nothing matches', async () => {
    const fyRepo = { findAppointmentsByContactPhone: vi.fn(async () => null) } as any;
    const useCase = new FindFyAppointmentsByPhoneUseCase(fyRepo);
    await expect(useCase.execute({ phone: '12345' })).rejects.toBeInstanceOf(ValidationError);
    await expect(useCase.execute({ phone: '+61412345678' })).rejects.toBeInstanceOf(
      NoActiveAppointmentsError,
    );
  });
});

describe('GetFyAppointmentUseCase', () => {
  const appointment = {
    id: 'a1',
    appointmentNumber: 42,
    tenantId: 't1',
    serviceTypeId: 'st1',
    inspectorId: 'i1',
    status: 'SCHEDULED',
    scheduledDate: new Date('2026-08-10T00:00:00Z'),
    timeSlotStart: '09:00',
    timeSlotEnd: '12:00',
    keyRequired: false,
    meetingLocation: 'front door',
    keyLocation: 'lockbox',
    rentalTenantConfirmationStatus: 'CONFIRMED',
    notes: 'op note',
    rentalTenantNote: null,
  };
  const found = {
    appointment,
    contact: { effectiveName: 'John', effectiveEmail: 'j@x.com', effectivePhone: '+61412345678' },
    contacts: [],
    restrictions: [],
    tenantAppointmentCodePrefix: 'INS',
    serviceTypeName: 'Routine Inspection',
    inspectorName: 'Kez Anderson',
    tenantName: 'Belle',
    propertyAddress: '12 George St',
    hasActivePortalToken: true,
  } as any;
  const appointmentRepo = { findById: vi.fn(async () => found) } as any;
  const fyRepo = {
    findAgencyById: vi.fn(async () => ({ id: 't1', name: 'Belle', timezone: 'Australia/Sydney', branches: [] })),
  } as any;
  const encrypter = { decrypt: vi.fn(() => 'raw-token'), encrypt: vi.fn() } as any;

  function tokenRepo(token: unknown) {
    return { findActiveByAppointmentId: vi.fn(async () => token) } as any;
  }

  it('returns detail with the confirmation link URL', async () => {
    const useCase = new GetFyAppointmentUseCase(
      appointmentRepo,
      tokenRepo({
        rawTokenEncrypted: 'enc',
        expiresAt: new Date(Date.now() + 3_600_000),
      }),
      encrypter,
      'https://properfy.example',
      fyRepo,
    );
    const detail = await useCase.execute({ appointmentId: 'a1' });
    expect(detail.confirmationLink.url).toBe('https://properfy.example/portal/raw-token');
    expect(detail.inspector).toEqual({ id: 'i1', name: 'Kez Anderson' });
    expect(detail.contact?.confirmed).toBe(true);
  });

  it('returns url null for expired or missing tokens instead of throwing', async () => {
    const expired = new GetFyAppointmentUseCase(
      appointmentRepo,
      tokenRepo({ rawTokenEncrypted: 'enc', expiresAt: new Date(Date.now() - 1000) }),
      encrypter,
      'https://properfy.example',
      fyRepo,
    );
    expect((await expired.execute({ appointmentId: 'a1' })).confirmationLink.url).toBeNull();

    const missing = new GetFyAppointmentUseCase(
      appointmentRepo,
      tokenRepo(null),
      encrypter,
      'https://properfy.example',
      fyRepo,
    );
    expect((await missing.execute({ appointmentId: 'a1' })).confirmationLink).toEqual({
      url: null,
      expiresAt: null,
    });
  });

  it('404 on unknown appointment', async () => {
    const useCase = new GetFyAppointmentUseCase(
      { findById: vi.fn(async () => null) } as any,
      tokenRepo(null),
      encrypter,
      'https://x',
      fyRepo,
    );
    await expect(useCase.execute({ appointmentId: 'nope' })).rejects.toBeInstanceOf(
      AppointmentNotFoundError,
    );
  });
});

describe('GetFyAgencyUseCase', () => {
  it('returns the agency card or 404', async () => {
    const agency = { id: 't1', name: 'Belle', timezone: 'Australia/Sydney', branches: [] };
    const useCase = new GetFyAgencyUseCase({ findAgencyById: vi.fn(async () => agency) } as any);
    expect(await useCase.execute({ agencyId: 't1' })).toEqual(agency);

    const missing = new GetFyAgencyUseCase({ findAgencyById: vi.fn(async () => null) } as any);
    await expect(missing.execute({ agencyId: 'x' })).rejects.toBeInstanceOf(AgencyNotFoundError);
  });
});

describe('GetFyAvailableDatesUseCase', () => {
  const appointmentRepo = {
    findById: vi.fn(async () => ({
      appointment: { tenantId: 't1', serviceTypeId: 'st1', propertyId: 'p1' },
    })),
  } as any;

  function inDays(days: number): Date {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + days);
    return d;
  }

  /** Next weekday at least `minDays` ahead (skips Sat/Sun). */
  function weekdayInDays(minDays: number): Date {
    const d = inDays(minDays);
    while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
    return d;
  }

  function groupRepo(slots: Array<{ scheduledDate: Date; timeSlotStart: string; timeSlotEnd: string }>) {
    return { findPortalEligibleSlots: vi.fn(async () => slots) } as any;
  }

  it('filters weekends, out-of-window hours, and groups by date', async () => {
    const weekday = weekdayInDays(10);
    const saturday = inDays(10);
    while (saturday.getUTCDay() !== 6) saturday.setUTCDate(saturday.getUTCDate() + 1);

    const useCase = new GetFyAvailableDatesUseCase(
      appointmentRepo,
      groupRepo([
        { scheduledDate: weekday, timeSlotStart: '09:00', timeSlotEnd: '12:00' },
        { scheduledDate: weekday, timeSlotStart: '13:00', timeSlotEnd: '17:00' },
        { scheduledDate: weekday, timeSlotStart: '06:00', timeSlotEnd: '09:00' }, // before 08:00
        { scheduledDate: saturday, timeSlotStart: '09:00', timeSlotEnd: '12:00' }, // weekend
      ]),
    );

    const result = await useCase.execute({ appointmentId: 'a1', limit: 5 });
    expect(result.availableDates).toHaveLength(1);
    expect(result.availableDates[0]?.timeSlots).toEqual([
      { start: '09:00', end: '12:00' },
      { start: '13:00', end: '17:00' },
    ]);
  });

  it('409 when all legal candidates violate the 7-day notice', async () => {
    const soon = weekdayInDays(2);
    const useCase = new GetFyAvailableDatesUseCase(
      appointmentRepo,
      groupRepo([{ scheduledDate: soon, timeSlotStart: '09:00', timeSlotEnd: '12:00' }]),
    );
    await expect(useCase.execute({ appointmentId: 'a1', limit: 5 })).rejects.toBeInstanceOf(
      NoticePeriodViolationError,
    );
  });

  it('empty list when there are no candidate groups at all', async () => {
    const useCase = new GetFyAvailableDatesUseCase(appointmentRepo, groupRepo([]));
    expect((await useCase.execute({ appointmentId: 'a1', limit: 5 })).availableDates).toEqual([]);
  });

  it('respects the limit across dates', async () => {
    const slots = [10, 15, 20, 25, 30, 35].map((days) => ({
      scheduledDate: weekdayInDays(days),
      timeSlotStart: '09:00',
      timeSlotEnd: '12:00',
    }));
    const useCase = new GetFyAvailableDatesUseCase(appointmentRepo, groupRepo(slots));
    const result = await useCase.execute({ appointmentId: 'a1', limit: 3 });
    expect(result.availableDates.length).toBeLessThanOrEqual(3);
  });
});

describe('AddFyAppointmentNoteUseCase', () => {
  it('appends a timestamped Fy line and audits', async () => {
    const fyRepo = { appendAppointmentNote: vi.fn(async () => true) } as any;
    const useCase = new AddFyAppointmentNoteUseCase(fyRepo, auditService);

    const result = await useCase.execute({
      appointmentId: 'a1',
      content: 'Call 30 min before arrival',
      actor,
    });

    const line = fyRepo.appendAppointmentNote.mock.calls[0][1] as string;
    expect(line).toMatch(/^\[Fy \d{4}-\d{2}-\d{2}T.*\] Call 30 min before arrival$/);
    expect(result.content).toBe('Call 30 min before arrival');
    expect(auditService.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'fy.note_added', actorId: 'api-key:k-1' }),
    );
  });

  it('404 when the appointment does not exist', async () => {
    const fyRepo = { appendAppointmentNote: vi.fn(async () => false) } as any;
    await expect(
      new AddFyAppointmentNoteUseCase(fyRepo, auditService).execute({
        appointmentId: 'x',
        content: 'hi',
        actor,
      }),
    ).rejects.toBeInstanceOf(AppointmentNotFoundError);
  });
});

describe('ResendFyNoticeUseCase', () => {
  it('returns QUEUED when dispatched', async () => {
    const generate = { execute: vi.fn(async () => ({ dispatched: true })) } as any;
    const result = await new ResendFyNoticeUseCase(generate).execute({
      appointmentId: 'a1',
      actor,
    });
    expect(result).toEqual({ status: 'QUEUED' });
    expect(generate.execute).toHaveBeenCalledWith({ appointmentId: 'a1', actor });
  });

  it('409 when there is no primary contact', async () => {
    const generate = {
      execute: vi.fn(async () => ({ dispatched: false, reason: 'NO_PRIMARY_CONTACT' })),
    } as any;
    await expect(
      new ResendFyNoticeUseCase(generate).execute({ appointmentId: 'a1', actor }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
