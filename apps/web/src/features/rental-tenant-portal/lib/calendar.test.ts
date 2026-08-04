import { describe, it, expect } from 'vitest';
import {
  buildInspectionCalendarEvent,
  buildIcsContent,
  buildGoogleCalendarUrl,
  buildOutlookCalendarUrl,
} from './calendar';

const BASE_INPUT = {
  appointmentId: 'appt-1',
  scheduledDate: '2026-07-15',
  timeSlotStart: '09:00',
  timeSlotEnd: '11:00',
  propertyAddress: '12 Bourke St, Surry Hills, NSW 2010',
  propertyCode: 'ACM-PROP-0007',
  serviceTypeName: 'Routine Inspection',
  agencyName: 'Acme Realty',
  timezone: 'Australia/Sydney',
};

describe('buildInspectionCalendarEvent', () => {
  it('resolves the Sydney wall time to UTC during standard time (UTC+10)', () => {
    const event = buildInspectionCalendarEvent(BASE_INPUT);

    // 15 Jul is winter in Sydney: AEST, UTC+10 -> 09:00 local is 23:00 UTC the day before.
    expect(event?.startUtc.toISOString()).toBe('2026-07-14T23:00:00.000Z');
    expect(event?.endUtc.toISOString()).toBe('2026-07-15T01:00:00.000Z');
  });

  it('resolves the Sydney wall time to UTC during daylight saving (UTC+11)', () => {
    const event = buildInspectionCalendarEvent({
      ...BASE_INPUT,
      scheduledDate: '2026-01-15',
    });

    // 15 Jan is summer in Sydney: AEDT, UTC+11 -> 09:00 local is 22:00 UTC the day before.
    // A naive implementation that stamped a fixed offset would be an hour out for half
    // the year, which is the whole reason this reuses zonedWallTimeToUtc.
    expect(event?.startUtc.toISOString()).toBe('2026-01-14T22:00:00.000Z');
    expect(event?.endUtc.toISOString()).toBe('2026-01-15T00:00:00.000Z');
  });

  it('produces a stable uid so re-adding updates the event instead of duplicating it', () => {
    const first = buildInspectionCalendarEvent(BASE_INPUT);
    const second = buildInspectionCalendarEvent(BASE_INPUT);

    expect(first?.uid).toBe(second?.uid);
    expect(first?.uid).toContain('appt-1');
  });

  it('falls back to a one-hour duration when the end is not after the start', () => {
    const event = buildInspectionCalendarEvent({
      ...BASE_INPUT,
      timeSlotStart: '09:00',
      timeSlotEnd: '09:00',
    });

    expect(event?.endUtc.getTime()).toBe((event?.startUtc.getTime() ?? 0) + 60 * 60 * 1000);
  });

  it('builds a title and location from the agency, service type and address', () => {
    const event = buildInspectionCalendarEvent(BASE_INPUT);

    expect(event?.title).toContain('Routine Inspection');
    expect(event?.location).toBe('12 Bourke St, Surry Hills, NSW 2010');
    expect(event?.description).toContain('Acme Realty');
    expect(event?.description).toContain('ACM-PROP-0007');
  });

  it('still builds an event when the optional fields are missing', () => {
    const event = buildInspectionCalendarEvent({
      appointmentId: 'appt-2',
      scheduledDate: '2026-07-15',
      timeSlotStart: '09:00',
      timeSlotEnd: '11:00',
      propertyAddress: null,
      propertyCode: null,
      serviceTypeName: null,
      agencyName: null,
      timezone: 'Australia/Sydney',
    });

    expect(event).not.toBeNull();
    expect(event?.location).toBe('');
  });

  it.each([
    ['empty date', { scheduledDate: '' }],
    ['malformed date', { scheduledDate: '15/07/2026' }],
    ['impossible date', { scheduledDate: '2026-02-30' }],
    ['malformed time', { timeSlotStart: '9am' }],
    ['empty time', { timeSlotEnd: '' }],
  ])('returns null without throwing for %s', (_label, override) => {
    expect(() => buildInspectionCalendarEvent({ ...BASE_INPUT, ...override })).not.toThrow();
    expect(buildInspectionCalendarEvent({ ...BASE_INPUT, ...override })).toBeNull();
  });
});

describe('buildIcsContent', () => {
  const NOW = new Date('2026-07-01T03:04:05.000Z');

  function ics(overrides: Partial<typeof BASE_INPUT> = {}): string {
    const event = buildInspectionCalendarEvent({ ...BASE_INPUT, ...overrides });
    if (!event) throw new Error('expected an event');
    return buildIcsContent(event, NOW);
  }

  it('wraps a single VEVENT in a VCALENDAR', () => {
    const content = ics();

    expect(content.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(content.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(content).toContain('VERSION:2.0');
    expect(content).toContain('PRODID:');
    expect(content.match(/BEGIN:VEVENT/g)).toHaveLength(1);
  });

  it('separates every line with CRLF, as RFC 5545 requires', () => {
    const content = ics();
    const lines = content.split('\r\n');

    expect(lines.length).toBeGreaterThan(8);
    // No bare LF anywhere: every \n must be preceded by \r.
    expect(/[^\r]\n/.test(content)).toBe(false);
  });

  it('stamps DTSTART and DTEND as UTC instants', () => {
    const content = ics();

    expect(content).toContain('DTSTART:20260714T230000Z');
    expect(content).toContain('DTEND:20260715T010000Z');
    expect(content).toContain('DTSTAMP:20260701T030405Z');
  });

  it('escapes commas, semicolons and backslashes in text fields', () => {
    const content = ics({
      propertyAddress: 'Unit 3, 12 Bourke St; rear lane\\side',
    });
    const locationLine = unfold(content)
      .split('\r\n')
      .find((line) => line.startsWith('LOCATION:'));

    expect(locationLine).toBe('LOCATION:Unit 3\\, 12 Bourke St\\; rear lane\\\\side');
  });

  it('escapes newlines inside a text field as literal \\n', () => {
    const content = ics({ serviceTypeName: 'Routine\nInspection' });

    expect(unfold(content)).toContain('Routine\\nInspection');
    // The escape must not introduce a real line break into the body.
    expect(content).not.toContain('Routine\r\nInspection');
  });

  it('folds lines longer than 75 octets with a leading space on continuations', () => {
    const longAddress =
      'Apartment 1502, 455 Elizabeth Street, Surry Hills, New South Wales 2010, Australia';
    const content = ics({ propertyAddress: longAddress });

    for (const line of content.split('\r\n')) {
      expect(byteLength(line)).toBeLessThanOrEqual(75);
    }
    // Folding is reversible: unfolding restores the address (with escaped commas).
    expect(unfold(content)).toContain('Apartment 1502\\, 455 Elizabeth Street');
    expect(content).toMatch(/\r\n /);
  });

  it('carries the stable uid', () => {
    const event = buildInspectionCalendarEvent(BASE_INPUT);
    expect(ics()).toContain(`UID:${event?.uid}`);
  });
});

describe('buildGoogleCalendarUrl', () => {
  it('targets the render template with a UTC date range', () => {
    const event = buildInspectionCalendarEvent(BASE_INPUT);
    const url = new URL(buildGoogleCalendarUrl(event!));

    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('dates')).toBe('20260714T230000Z/20260715T010000Z');
    expect(url.searchParams.get('text')).toContain('Routine Inspection');
    expect(url.searchParams.get('location')).toBe('12 Bourke St, Surry Hills, NSW 2010');
    expect(url.searchParams.get('details')).toContain('Acme Realty');
  });

  it('percent-encodes reserved characters rather than emitting them raw', () => {
    const event = buildInspectionCalendarEvent({
      ...BASE_INPUT,
      propertyAddress: 'Unit 3 & 4, 12 Bourke St',
    });
    const raw = buildGoogleCalendarUrl(event!);

    expect(raw).not.toContain('& 4');
    expect(new URL(raw).searchParams.get('location')).toBe('Unit 3 & 4, 12 Bourke St');
  });
});

describe('buildOutlookCalendarUrl', () => {
  it('targets the compose deeplink with ISO instants', () => {
    const event = buildInspectionCalendarEvent(BASE_INPUT);
    const url = new URL(buildOutlookCalendarUrl(event!));

    expect(url.origin).toBe('https://outlook.live.com');
    expect(url.pathname).toContain('/deeplink/compose');
    expect(url.searchParams.get('path')).toBe('/calendar/action/compose');
    expect(url.searchParams.get('rru')).toBe('addevent');
    expect(url.searchParams.get('startdt')).toBe('2026-07-14T23:00:00.000Z');
    expect(url.searchParams.get('enddt')).toBe('2026-07-15T01:00:00.000Z');
    expect(url.searchParams.get('subject')).toContain('Routine Inspection');
    expect(url.searchParams.get('location')).toBe('12 Bourke St, Surry Hills, NSW 2010');
  });
});

/** Reverse RFC 5545 folding so assertions can target the logical line. */
function unfold(content: string): string {
  return content.replace(/\r\n /g, '');
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}
