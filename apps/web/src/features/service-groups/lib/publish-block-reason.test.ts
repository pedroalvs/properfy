import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ServiceGroupStatus } from '@properfy/shared';
import { getPublishBlockReason } from './publish-block-reason';

// 2026-05-01T00:00:00Z is 2026-05-01 10:00 in Sydney, the timezone the shared
// validator resolves "today" in. Only Date is faked so timers stay real.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-05-01T00:00:00Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

const base = {
  status: ServiceGroupStatus.DRAFT,
  appointmentCount: 2,
  scheduledDate: '2026-06-01',
  timeWindow: '09:00-12:00',
};

describe('getPublishBlockReason', () => {
  it('returns null for a valid future DRAFT group', () => {
    expect(getPublishBlockReason(base)).toBeNull();
  });

  it('blocks a group with no appointments', () => {
    expect(getPublishBlockReason({ ...base, appointmentCount: 0 })).toMatch(/no appointments/i);
  });

  it('blocks a group whose scheduled date has passed', () => {
    expect(getPublishBlockReason({ ...base, scheduledDate: '2026-04-30' })).toMatch(/past/i);
  });

  it('blocks a group scheduled for today whose window has already started', () => {
    expect(
      getPublishBlockReason({ ...base, scheduledDate: '2026-05-01', timeWindow: '09:00-12:00' }),
    ).toMatch(/already started/i);
  });

  it('allows a group scheduled for today whose window is still ahead', () => {
    expect(
      getPublishBlockReason({ ...base, scheduledDate: '2026-05-01', timeWindow: '15:00-18:00' }),
    ).toBeNull();
  });

  it('accepts an ISO datetime for scheduledDate', () => {
    expect(getPublishBlockReason({ ...base, scheduledDate: '2026-04-30T00:00:00.000Z' })).toMatch(
      /past/i,
    );
  });

  it('falls back to a date-only check when the time window is unknown', () => {
    expect(
      getPublishBlockReason({ ...base, scheduledDate: '2026-05-01', timeWindow: undefined }),
    ).toBeNull();
  });

  it('skips the schedule check when the date is unknown, leaving it to the backend', () => {
    expect(getPublishBlockReason({ ...base, scheduledDate: undefined })).toBeNull();
  });

  it('lists appointments that are not awaiting inspector', () => {
    const reason = getPublishBlockReason({
      ...base,
      blockingAppointments: [{ label: '#12', status: 'CANCELLED' }],
    });
    expect(reason).toContain('#12');
    expect(reason).toContain('CANCELLED');
  });

  it('reports the empty group before the appointment statuses', () => {
    const reason = getPublishBlockReason({
      ...base,
      appointmentCount: 0,
      blockingAppointments: [{ label: '#12', status: 'CANCELLED' }],
    });
    expect(reason).toMatch(/no appointments/i);
  });

  it('does not block non-DRAFT groups (publish is not offered for them)', () => {
    expect(
      getPublishBlockReason({ ...base, status: ServiceGroupStatus.PUBLISHED, appointmentCount: 0 }),
    ).toBeNull();
  });
});
