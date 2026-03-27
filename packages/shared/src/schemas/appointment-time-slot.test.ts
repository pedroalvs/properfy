import { describe, expect, it } from 'vitest';
import {
  createAppointmentTimeSlotSchema,
  updateAppointmentTimeSlotSchema,
} from './appointment-time-slot';

describe('appointment time slot schemas', () => {
  it('rejects create payloads with endTime before startTime', () => {
    const parsed = createAppointmentTimeSlotSchema.safeParse({
      tenantId: '11111111-1111-1111-1111-111111111111',
      label: 'Morning',
      startTime: '17:00',
      endTime: '09:00',
      sortOrder: 0,
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(['endTime']);
  });

  it('rejects update payloads when both times produce an invalid range', () => {
    const parsed = updateAppointmentTimeSlotSchema.safeParse({
      startTime: '14:00',
      endTime: '12:00',
    });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(['endTime']);
  });
});
