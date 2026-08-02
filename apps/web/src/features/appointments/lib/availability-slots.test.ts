import { describe, it, expect } from 'vitest';
import type { AvailableSlot } from '@properfy/shared';
import { formatAvailabilitySlots, orderSlots, DAY_LABELS } from './availability-slots';

describe('orderSlots', () => {
  it('puts the week back in Mon→Sun order regardless of input order', () => {
    const slots: AvailableSlot[] = [
      { dayOfWeek: 'SUN', start: '10:00', end: '12:00' },
      { dayOfWeek: 'WED', start: '14:00', end: '17:00' },
      { dayOfWeek: 'MON', start: '09:00', end: '12:00' },
    ];

    expect(orderSlots(slots).map((s) => s.dayOfWeek)).toEqual(['MON', 'WED', 'SUN']);
  });

  it('does not mutate the caller array', () => {
    const slots: AvailableSlot[] = [
      { dayOfWeek: 'FRI', start: '09:00', end: '10:00' },
      { dayOfWeek: 'MON', start: '09:00', end: '10:00' },
    ];
    orderSlots(slots);

    expect(slots[0]!.dayOfWeek).toBe('FRI');
  });
});

describe('formatAvailabilitySlots', () => {
  it('renders one tooltip line, ordered, with a readable separator', () => {
    const slots: AvailableSlot[] = [
      { dayOfWeek: 'WED', start: '14:00', end: '17:00' },
      { dayOfWeek: 'MON', start: '09:00', end: '12:00' },
    ];

    expect(formatAvailabilitySlots(slots)).toBe('Mon 09:00 - 12:00 · Wed 14:00 - 17:00');
  });

  it('returns an empty string for no slots so callers can pick their own fallback', () => {
    expect(formatAvailabilitySlots([])).toBe('');
    expect(formatAvailabilitySlots(null)).toBe('');
    expect(formatAvailabilitySlots(undefined)).toBe('');
  });

  it('falls back to the raw day code for an unrecognised value', () => {
    // Guards against a future enum value rendering as "undefined".
    const slots = [{ dayOfWeek: 'FUNDAY', start: '09:00', end: '10:00' }] as unknown as AvailableSlot[];
    expect(formatAvailabilitySlots(slots)).toBe('FUNDAY 09:00 - 10:00');
  });
});

describe('DAY_LABELS', () => {
  it('covers every day of the week', () => {
    expect(Object.keys(DAY_LABELS)).toHaveLength(7);
  });
});
