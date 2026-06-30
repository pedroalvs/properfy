import { describe, it, expect } from 'vitest';
import {
  portalTokenParam,
  confirmAppointmentPortalSchema,
  confirmAppointmentPortalResponseSchema,
  rescheduleRequestPortalSchema,
  rescheduleRequestPortalResponseSchema,
  updateContactPortalSchema,
  reportUnavailabilityPortalSchema,
  reportUnavailabilityPortalResponseSchema,
  availableSlotSchema,
  joinGroupRequestSchema,
  availableGroupsResponseSchema,
} from './rental-tenant-portal';

describe('portalTokenParam', () => {
  it('should accept a valid token', () => {
    const result = portalTokenParam.safeParse({ token: 'abc123' });
    expect(result.success).toBe(true);
  });

  it('should reject an empty token', () => {
    const result = portalTokenParam.safeParse({ token: '' });
    expect(result.success).toBe(false);
  });

  it('should reject missing token', () => {
    const result = portalTokenParam.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('confirmAppointmentPortalSchema', () => {
  it('should accept empty body', () => {
    const result = confirmAppointmentPortalSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept body with restrictions', () => {
    const result = confirmAppointmentPortalSchema.safeParse({
      restrictions: {
        isHome: true,
        notes: 'Please ring the bell',
      },
    });
    expect(result.success).toBe(true);
  });

  it('should accept restrictions with unavailable days and hours', () => {
    const result = confirmAppointmentPortalSchema.safeParse({
      restrictions: {
        unavailableDaysJson: ['2026-04-01', '2026-04-02'],
        unavailableHoursJson: [{ start: '08:00', end: '10:00' }],
      },
    });
    expect(result.success).toBe(true);
  });

  it('should accept null values for nullable fields', () => {
    const result = confirmAppointmentPortalSchema.safeParse({
      restrictions: {
        isHome: null,
        unavailableDaysJson: null,
        unavailableHoursJson: null,
        notes: null,
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('rescheduleRequestPortalSchema', () => {
  // Use a dynamic future date so this fixture never turns into a ticking
  // time bomb when downstream consumers add past-date refines. The shared
  // schema currently only validates the YYYY-MM-DD shape, but keeping the
  // convention consistent with the rest of the suite means the fixture
  // remains safe even if the refine tightens later.
  const futureDate = (() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 30);
    return d.toISOString().split('T')[0]!;
  })();
  const validInput = {
    newDate: futureDate,
    newTimeSlot: '08:00-10:00',
  };

  it('should accept valid input', () => {
    const result = rescheduleRequestPortalSchema.safeParse(validInput);
    expect(result.success).toBe(true);
  });

  it('should accept valid input with restrictions', () => {
    const result = rescheduleRequestPortalSchema.safeParse({
      ...validInput,
      restrictions: { isHome: false, notes: 'Prefer morning' },
    });
    expect(result.success).toBe(true);
  });

  it('should reject missing newDate', () => {
    const { newDate: _newDate, ...rest } = validInput;
    const result = rescheduleRequestPortalSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject invalid date format', () => {
    const result = rescheduleRequestPortalSchema.safeParse({
      ...validInput,
      newDate: '15/04/2026',
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing newTimeSlot', () => {
    const { newTimeSlot: _newTimeSlot, ...rest } = validInput;
    const result = rescheduleRequestPortalSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('should reject empty newTimeSlot', () => {
    const result = rescheduleRequestPortalSchema.safeParse({
      ...validInput,
      newTimeSlot: '',
    });
    expect(result.success).toBe(false);
  });

  it('should reject newTimeSlot exceeding 50 characters', () => {
    const result = rescheduleRequestPortalSchema.safeParse({
      ...validInput,
      newTimeSlot: 'x'.repeat(51),
    });
    expect(result.success).toBe(false);
  });
});

describe('updateContactPortalSchema', () => {
  it('should accept a single field', () => {
    const result = updateContactPortalSchema.safeParse({
      primaryEmail: 'tenant@example.com',
    });
    expect(result.success).toBe(true);
  });

  it('should accept all fields', () => {
    const result = updateContactPortalSchema.safeParse({
      primaryEmail: 'tenant@example.com',
      secondaryEmail: 'alt@example.com',
      primaryPhone: '11999887766',
      secondaryPhone: '11888776655',
    });
    expect(result.success).toBe(true);
  });

  it('should reject empty object (at least one field required)', () => {
    const result = updateContactPortalSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should reject invalid email', () => {
    const result = updateContactPortalSchema.safeParse({
      primaryEmail: 'not-an-email',
    });
    expect(result.success).toBe(false);
  });

  it('should accept null for nullable fields', () => {
    const result = updateContactPortalSchema.safeParse({
      primaryEmail: 'tenant@example.com',
      secondaryEmail: null,
      secondaryPhone: null,
    });
    expect(result.success).toBe(true);
  });

  it('should reject phone shorter than 8 characters', () => {
    const result = updateContactPortalSchema.safeParse({
      primaryPhone: '1234567',
    });
    expect(result.success).toBe(false);
  });

  it('should reject phone longer than 20 characters', () => {
    const result = updateContactPortalSchema.safeParse({
      primaryPhone: '1'.repeat(21),
    });
    expect(result.success).toBe(false);
  });
});

describe('reportUnavailabilityPortalSchema', () => {
  it('should accept empty body', () => {
    const result = reportUnavailabilityPortalSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('should accept body with restrictions', () => {
    const result = reportUnavailabilityPortalSchema.safeParse({
      restrictions: {
        unavailableDaysJson: ['2026-04-01'],
        notes: 'Will be traveling',
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('confirmAppointmentPortalResponseSchema', () => {
  it('should accept the real confirm command response', () => {
    const result = confirmAppointmentPortalResponseSchema.safeParse({
      rentalTenantConfirmationStatus: 'CONFIRMED',
      confirmedAt: '2026-03-01T00:00:00.000Z',
    });
    expect(result.success).toBe(true);
  });
});

describe('rescheduleRequestPortalResponseSchema', () => {
  it('should accept the real reschedule command response', () => {
    const result = rescheduleRequestPortalResponseSchema.safeParse({
      scheduledDate: '2026-05-01',
      timeSlot: '09:00-10:00',
      rentalTenantConfirmationStatus: 'PENDING',
    });
    expect(result.success).toBe(true);
  });
});

describe('reportUnavailabilityPortalResponseSchema', () => {
  it('should accept the real unavailability command response', () => {
    const result = reportUnavailabilityPortalResponseSchema.safeParse({
      rentalTenantConfirmationStatus: 'UNAVAILABLE',
      urgentMode: false,
    });
    expect(result.success).toBe(true);
  });
});

describe('availableSlotSchema', () => {
  it('should accept a valid slot', () => {
    const result = availableSlotSchema.safeParse({ dayOfWeek: 'MON', start: '09:00', end: '17:00' });
    expect(result.success).toBe(true);
  });

  it('should reject invalid time format', () => {
    const result = availableSlotSchema.safeParse({ dayOfWeek: 'MON', start: '9:00', end: '17:00' });
    expect(result.success).toBe(false);
  });

  it('should reject invalid day enum', () => {
    const result = availableSlotSchema.safeParse({ dayOfWeek: 'MONDAY', start: '09:00', end: '17:00' });
    expect(result.success).toBe(false);
  });

  it('should reject start equal to end', () => {
    const result = availableSlotSchema.safeParse({ dayOfWeek: 'WED', start: '09:00', end: '09:00' });
    expect(result.success).toBe(false);
  });

  it('should reject start after end', () => {
    const result = availableSlotSchema.safeParse({ dayOfWeek: 'FRI', start: '17:00', end: '09:00' });
    expect(result.success).toBe(false);
  });

  it('should accept all day values', () => {
    for (const day of ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const) {
      const result = availableSlotSchema.safeParse({ dayOfWeek: day, start: '08:00', end: '12:00' });
      expect(result.success).toBe(true);
    }
  });
});

describe('joinGroupRequestSchema', () => {
  it('should accept valid groupId', () => {
    const result = joinGroupRequestSchema.safeParse({ groupId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890' });
    expect(result.success).toBe(true);
  });

  it('should accept groupId with rentalTenantNote', () => {
    const result = joinGroupRequestSchema.safeParse({
      groupId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      rentalTenantNote: 'Please bring an extra key',
    });
    expect(result.success).toBe(true);
  });

  it('should reject non-uuid groupId', () => {
    const result = joinGroupRequestSchema.safeParse({ groupId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('should reject rentalTenantNote exceeding 2000 chars', () => {
    const result = joinGroupRequestSchema.safeParse({
      groupId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      rentalTenantNote: 'x'.repeat(2001),
    });
    expect(result.success).toBe(false);
  });
});

describe('availableGroupsResponseSchema', () => {
  it('should accept empty groups array', () => {
    const result = availableGroupsResponseSchema.safeParse({ groups: [] });
    expect(result.success).toBe(true);
  });

  it('should accept valid group list', () => {
    const result = availableGroupsResponseSchema.safeParse({
      groups: [
        {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          scheduledDate: '2026-06-10',
          timeWindow: '09:00-12:00',
          suburb: 'Surry Hills',
          inspectorName: 'John Smith',
          confirmedCount: 3,
          capacityMax: 10,
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('should reject group with invalid scheduledDate format', () => {
    const result = availableGroupsResponseSchema.safeParse({
      groups: [
        {
          id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          scheduledDate: '10/06/2026',
          timeWindow: '09:00-12:00',
          suburb: 'Surry Hills',
          inspectorName: 'John Smith',
          confirmedCount: 3,
          capacityMax: 10,
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe('reportUnavailabilityPortalSchema with availableSlotsJson', () => {
  it('should accept restrictions with availableSlotsJson', () => {
    const result = reportUnavailabilityPortalSchema.safeParse({
      restrictions: {
        availableSlotsJson: [
          { dayOfWeek: 'MON', start: '09:00', end: '12:00' },
          { dayOfWeek: 'WED', start: '14:00', end: '17:00' },
        ],
      },
    });
    expect(result.success).toBe(true);
  });

  it('should reject restrictions with invalid availableSlotsJson slot', () => {
    const result = reportUnavailabilityPortalSchema.safeParse({
      restrictions: {
        availableSlotsJson: [{ dayOfWeek: 'MON', start: '17:00', end: '09:00' }],
      },
    });
    expect(result.success).toBe(false);
  });

  it('should accept null availableSlotsJson', () => {
    const result = reportUnavailabilityPortalSchema.safeParse({
      restrictions: { availableSlotsJson: null },
    });
    expect(result.success).toBe(true);
  });
});
