import { describe, expect, it } from 'vitest';

import {
  fyAppointmentStatusSchema,
  fyAvailableDatesQuerySchema,
  fyContactUpdateSchema,
  fyPhoneQuerySchema,
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
