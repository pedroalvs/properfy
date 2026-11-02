import { describe, it, expect } from 'vitest';
import {
  cantDoRequestSchema,
  lateNoticeRequestSchema,
  lateNoticeResponseSchema,
  inspectorIssueSchema,
  inspectorLastFieldIssueSchema,
  appointmentFieldActivityResponseSchema,
} from './field-events';

describe('cantDoRequestSchema', () => {
  it('accepts a reason that needs no note', () => {
    expect(cantDoRequestSchema.safeParse({ reason: 'NO_ANSWER' }).success).toBe(true);
  });

  it('requires a note for SITE_ISSUE', () => {
    const r = cantDoRequestSchema.safeParse({ reason: 'SITE_ISSUE' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const noteIssue = r.error.issues.find((i) => i.path[0] === 'note');
      expect(noteIssue?.message).toBe('Add a short note for this reason');
    }
  });

  it('rejects a whitespace-only note for SITE_ISSUE (trimmed)', () => {
    expect(cantDoRequestSchema.safeParse({ reason: 'SITE_ISSUE', note: '   ' }).success).toBe(false);
  });

  it('accepts SITE_ISSUE with a note', () => {
    expect(
      cantDoRequestSchema.safeParse({ reason: 'SITE_ISSUE', note: 'Gate locked' }).success,
    ).toBe(true);
  });

  it('rejects a note longer than 500 chars', () => {
    expect(
      cantDoRequestSchema.safeParse({ reason: 'NO_ANSWER', note: 'x'.repeat(501) }).success,
    ).toBe(false);
  });

  it('rejects an unknown reason', () => {
    expect(cantDoRequestSchema.safeParse({ reason: 'LATE' }).success).toBe(false);
  });

  it('accepts a full position', () => {
    expect(
      cantDoRequestSchema.safeParse({
        reason: 'NO_ANSWER',
        latitude: -33.86,
        longitude: 151.2,
        accuracy: 8,
        clientOccurredAt: '2026-11-03T09:41:12.000+11:00',
      }).success,
    ).toBe(true);
  });

  it('rejects latitude without longitude', () => {
    const r = cantDoRequestSchema.safeParse({ reason: 'NO_ANSWER', latitude: -33.86 });
    expect(r.success).toBe(false);
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path[0] === 'longitude');
      expect(issue?.message).toBe('Latitude and longitude must be sent together');
    }
  });
});

describe('lateNoticeRequestSchema', () => {
  it('accepts a valid notice', () => {
    expect(lateNoticeRequestSchema.safeParse({ reason: 'TRAFFIC', minutesLate: 20 }).success).toBe(
      true,
    );
  });

  it('rejects minutesLate below 5 or above 240 or non-integer', () => {
    expect(lateNoticeRequestSchema.safeParse({ reason: 'TRAFFIC', minutesLate: 4 }).success).toBe(false);
    expect(lateNoticeRequestSchema.safeParse({ reason: 'TRAFFIC', minutesLate: 241 }).success).toBe(false);
    expect(lateNoticeRequestSchema.safeParse({ reason: 'TRAFFIC', minutesLate: 20.5 }).success).toBe(false);
  });

  it('rejects a field-issue reason', () => {
    expect(lateNoticeRequestSchema.safeParse({ reason: 'NO_ANSWER', minutesLate: 20 }).success).toBe(false);
  });

  it('strips a note that is sent (the schema has none)', () => {
    const r = lateNoticeRequestSchema.parse({ reason: 'TRAFFIC', minutesLate: 20, note: 'x' } as never);
    expect('note' in r).toBe(false);
  });
});

describe('lateNoticeResponseSchema', () => {
  it('requires estimatedArrivalAt', () => {
    const base = {
      eventId: '11111111-1111-1111-1111-111111111111',
      appointmentId: '22222222-2222-2222-2222-222222222222',
      occurredAt: '2026-11-03T09:30:00.000Z',
      reason: 'TRAFFIC',
      minutesLate: 20,
      referenceAt: '2026-11-03T09:00:00.000Z',
      referenceSource: 'WINDOW_START',
    };
    expect(lateNoticeResponseSchema.safeParse(base).success).toBe(false);
    expect(
      lateNoticeResponseSchema.safeParse({ ...base, estimatedArrivalAt: '2026-11-03T09:20:00.000Z' })
        .success,
    ).toBe(true);
  });
});

describe('inspectorIssueSchema', () => {
  it('accepts a full issue with inspectorId and null name', () => {
    expect(
      inspectorIssueSchema.safeParse({
        reason: 'NO_ANSWER',
        note: null,
        inspectorId: '33333333-3333-3333-3333-333333333333',
        inspectorName: 'Jane Doe',
        occurredAt: '2026-11-03T09:41:12.000Z',
      }).success,
    ).toBe(true);
    expect(
      inspectorIssueSchema.safeParse({
        reason: 'NO_ANSWER',
        note: null,
        inspectorName: null,
        occurredAt: '2026-11-03T09:41:12.000Z',
      }).success,
    ).toBe(true);
  });

  it('accepts a legacy payload without inspectorId', () => {
    expect(
      inspectorIssueSchema.safeParse({
        reason: 'KEY_FAILED',
        note: 'Lockbox code wrong',
        inspectorName: 'Jane Doe',
        occurredAt: '2026-11-03T09:41:12.000Z',
      }).success,
    ).toBe(true);
  });
});

describe('inspectorLastFieldIssueSchema', () => {
  it('accepts a last field issue', () => {
    expect(
      inspectorLastFieldIssueSchema.safeParse({
        reason: 'KEY_FAILED',
        note: 'Lockbox code wrong',
        occurredAt: '2026-11-03T09:41:12.000Z',
      }).success,
    ).toBe(true);
  });
});

describe('appointmentFieldActivityResponseSchema', () => {
  const event = {
    id: '44444444-4444-4444-4444-444444444444',
    type: 'CANT_DO',
    reason: 'KEY_FAILED',
    note: 'Lockbox code wrong',
    minutesLate: null,
    inspectorName: 'Jane Doe',
    occurredAt: '2026-11-03T09:41:12.000Z',
    clientOccurredAt: null,
    accuracyMeters: 8,
  };
  const execution = {
    id: '55555555-5555-5555-5555-555555555555',
    inspectorName: 'Jane Doe',
    startedAt: '2026-11-03T09:00:00.000Z',
    finishedAt: null,
    abandonedAt: null,
    startClientAt: null,
    finishClientAt: null,
    startDistanceMeters: 120,
    finishDistanceMeters: null,
    startAccuracyMeters: 8,
    finishAccuracyMeters: null,
    outOfRadius: false,
    outOfWindow: false,
    finishOutOfRadius: false,
    geofenceRadiusMeters: 300,
  };

  it('accepts the AM/OP shape (with coordinates)', () => {
    expect(
      appointmentFieldActivityResponseSchema.safeParse({
        execution: { ...execution, startLatitude: -33.86, startLongitude: 151.2 },
        events: [{ ...event, latitude: -33.86, longitude: 151.2 }],
      }).success,
    ).toBe(true);
  });

  it('accepts the CL shape (coordinates omitted)', () => {
    expect(
      appointmentFieldActivityResponseSchema.safeParse({
        execution,
        events: [event],
      }).success,
    ).toBe(true);
  });

  it('accepts a null execution', () => {
    expect(
      appointmentFieldActivityResponseSchema.safeParse({ execution: null, events: [] }).success,
    ).toBe(true);
  });
});
