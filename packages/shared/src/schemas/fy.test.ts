import { describe, expect, it } from 'vitest';

import {
  fyAppointmentStatusSchema,
  fyAvailableDatesQuerySchema,
  fyContactUpdateSchema,
  fyPhoneQuerySchema,
  fyWebhookEventSchema,
} from './fy';

describe('fyPhoneQuerySchema', () => {
  it('accepts E.164 and local AU formats', () => {
    expect(fyPhoneQuerySchema.parse({ phone: '+61412345678' }).phone).toBe('+61412345678');
    expect(fyPhoneQuerySchema.parse({ phone: '0412 345 678' }).phone).toBe('0412 345 678');
  });

  it('rejects invalid phones', () => {
    expect(fyPhoneQuerySchema.safeParse({ phone: '12345' }).success).toBe(false);
    expect(fyPhoneQuerySchema.safeParse({ phone: '' }).success).toBe(false);
  });

  it('splits statusIn and maps the OPEN alias', () => {
    const parsed = fyPhoneQuerySchema.parse({
      phone: '+61412345678',
      statusIn: 'OPEN, SCHEDULED',
    });
    expect(parsed.statusIn).toEqual(['AWAITING_INSPECTOR', 'SCHEDULED']);
  });

  it('leaves statusIn undefined when omitted and rejects unknown statuses', () => {
    expect(fyPhoneQuerySchema.parse({ phone: '+61412345678' }).statusIn).toBeUndefined();
    expect(
      fyPhoneQuerySchema.safeParse({ phone: '+61412345678', statusIn: 'BOGUS' }).success,
    ).toBe(false);
  });
});

describe('fyAppointmentStatusSchema', () => {
  it('accepts only canonical statuses', () => {
    expect(fyAppointmentStatusSchema.parse('AWAITING_INSPECTOR')).toBe('AWAITING_INSPECTOR');
    expect(fyAppointmentStatusSchema.safeParse('OPEN').success).toBe(false);
  });
});

describe('fyAvailableDatesQuerySchema', () => {
  it('defaults, coerces and bounds the limit', () => {
    expect(fyAvailableDatesQuerySchema.parse({}).limit).toBe(5);
    expect(fyAvailableDatesQuerySchema.parse({ limit: '7' }).limit).toBe(7);
    expect(fyAvailableDatesQuerySchema.safeParse({ limit: 11 }).success).toBe(false);
    expect(fyAvailableDatesQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  });
});

describe('fyContactUpdateSchema', () => {
  it('requires at least one field', () => {
    expect(fyContactUpdateSchema.safeParse({}).success).toBe(false);
    expect(fyContactUpdateSchema.safeParse({ name: 'John' }).success).toBe(true);
  });

  it('validates email and AU phone', () => {
    expect(fyContactUpdateSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
    expect(fyContactUpdateSchema.safeParse({ phone: '12345' }).success).toBe(false);
    expect(fyContactUpdateSchema.safeParse({ phone: '0412 345 678' }).success).toBe(true);
  });

  it('allows explicit nulls to clear email/phone', () => {
    expect(fyContactUpdateSchema.safeParse({ email: null }).success).toBe(true);
    expect(fyContactUpdateSchema.safeParse({ phone: null }).success).toBe(true);
  });
});

describe('fyWebhookEventSchema', () => {
  const base = { timestamp: '2026-07-09T10:00:00.000+11:00' };

  it('parses inspector.accepted', () => {
    const parsed = fyWebhookEventSchema.parse({
      ...base,
      event: 'inspector.accepted',
      data: {
        appointmentId: 'a0000000-0000-4000-8000-000000000001',
        appointmentCode: 'INS-0042',
        inspector: { id: 'b0000000-0000-4000-8000-000000000001', name: 'Kez' },
      },
    });
    expect(parsed.event).toBe('inspector.accepted');
  });

  it('parses appointment.status_changed and rejects unknown statuses', () => {
    const data = {
      appointmentId: 'a0000000-0000-4000-8000-000000000001',
      fromStatus: 'SCHEDULED',
      toStatus: 'DONE',
    };
    expect(
      fyWebhookEventSchema.parse({ ...base, event: 'appointment.status_changed', data }).event,
    ).toBe('appointment.status_changed');
    expect(
      fyWebhookEventSchema.safeParse({
        ...base,
        event: 'appointment.status_changed',
        data: { ...data, toStatus: 'OPEN' },
      }).success,
    ).toBe(false);
  });

  it('rejects unknown events and mismatched data shapes', () => {
    expect(fyWebhookEventSchema.safeParse({ ...base, event: 'nope', data: {} }).success).toBe(false);
    expect(
      fyWebhookEventSchema.safeParse({
        ...base,
        event: 'inspector.accepted',
        data: { appointmentId: 'not-a-uuid', appointmentCode: 'X', inspector: { id: 'x', name: '' } },
      }).success,
    ).toBe(false);
  });
});
