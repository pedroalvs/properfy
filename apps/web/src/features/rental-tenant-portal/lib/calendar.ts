import { zonedWallTimeToUtc } from '@properfy/shared';

/**
 * Calendar export for a confirmed inspection.
 *
 * Times are stored as a civil date plus a wall-clock slot, which carry no offset on
 * their own. `zonedWallTimeToUtc` resolves them against the agency timezone using the
 * offset actually in effect at that wall time, so a Sydney booking lands correctly on
 * either side of a daylight-saving transition. Because every stamp we emit is already
 * a UTC instant, the .ics needs no VTIMEZONE block.
 */

export interface InspectionCalendarInput {
  appointmentId: string;
  /** Civil date, `YYYY-MM-DD`. */
  scheduledDate: string;
  /** Wall time, `HH:mm`. */
  timeSlotStart: string;
  /** Wall time, `HH:mm`. */
  timeSlotEnd: string;
  propertyAddress: string | null;
  propertyCode: string | null;
  serviceTypeName: string | null;
  agencyName: string | null;
  /** IANA timezone, e.g. `Australia/Sydney`. */
  timezone: string;
}

export interface CalendarEvent {
  uid: string;
  title: string;
  startUtc: Date;
  endUtc: Date;
  description: string;
  location: string;
}

const ONE_HOUR_MS = 60 * 60 * 1000;
const DEFAULT_TITLE = 'Property inspection';

/**
 * Namespace for the iCal event UID. This is NOT a link — calendar clients never
 * resolve it (RFC 5545 §3.8.4.7); it only makes the UID globally unique, and the
 * real uniqueness already comes from the appointment id on the left.
 *
 * It is a FROZEN identity contract: once inspections have been exported, the UID
 * is how a re-download updates the existing calendar entry instead of creating a
 * duplicate. Changing this suffix re-identifies every previously exported event.
 * Do NOT repoint it at a new marketing/app domain on a future rebrand — it is
 * deliberately decoupled from branding for that reason. (Set to `properfy.me`
 * while the feature is unreleased, so no exported event yet depends on it.)
 */
const CALENDAR_UID_NAMESPACE = 'properfy.me';

/**
 * Build the calendar event for a confirmed inspection, or `null` when the appointment
 * carries a date or slot we cannot resolve. Callers render nothing on `null` — an
 * unusable event is worse than no button, and this never throws into the render path.
 */
export function buildInspectionCalendarEvent(
  input: InspectionCalendarInput,
): CalendarEvent | null {
  let startUtc: Date;
  let endUtc: Date;

  try {
    startUtc = zonedWallTimeToUtc(input.scheduledDate, input.timeSlotStart, input.timezone);
    endUtc = zonedWallTimeToUtc(input.scheduledDate, input.timeSlotEnd, input.timezone);
  } catch {
    // zonedWallTimeToUtc throws RangeError on a malformed or impossible civil date/time.
    return null;
  }

  // A slot that does not advance (or one that was stored inverted) would produce a
  // zero-length or negative event that calendar clients render inconsistently.
  if (endUtc.getTime() <= startUtc.getTime()) {
    endUtc = new Date(startUtc.getTime() + ONE_HOUR_MS);
  }

  const serviceType = input.serviceTypeName?.trim() || DEFAULT_TITLE;
  const title = input.agencyName?.trim()
    ? `${serviceType} — ${input.agencyName.trim()}`
    : serviceType;

  const descriptionLines = [
    input.agencyName?.trim()
      ? `Inspection arranged by ${input.agencyName.trim()}.`
      : 'Property inspection.',
    input.propertyCode?.trim() ? `Property code: ${input.propertyCode.trim()}` : null,
    input.propertyAddress?.trim() ? `Address: ${input.propertyAddress.trim()}` : null,
  ].filter((line): line is string => line !== null);

  return {
    // Stable across re-downloads so a calendar client updates the existing entry
    // rather than stacking duplicates when the tenant adds it twice. The namespace
    // is a frozen identity contract — see CALENDAR_UID_NAMESPACE.
    uid: `inspection-${input.appointmentId}@${CALENDAR_UID_NAMESPACE}`,
    title,
    startUtc,
    endUtc,
    description: descriptionLines.join('\n'),
    location: input.propertyAddress?.trim() ?? '',
  };
}

/** RFC 5545 UTC stamp: `YYYYMMDDTHHMMSSZ`. */
function toIcsStamp(value: Date): string {
  return `${value.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
}

/** RFC 5545 §3.3.11 text escaping. Backslash first, or the later escapes get doubled. */
function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * RFC 5545 §3.1 content-line folding: no line may exceed 75 octets, and continuations
 * begin with a single space. Measured in octets rather than characters so a multi-byte
 * character is never split across the fold.
 */
function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const parts: string[] = [];
  let current = '';
  let currentBytes = 0;
  // The first line may use all 75 octets; continuations spend one on the leading space.
  let limit = 75;

  for (const char of line) {
    const charBytes = encoder.encode(char).length;
    if (currentBytes + charBytes > limit) {
      parts.push(current);
      current = '';
      currentBytes = 0;
      limit = 74;
    }
    current += char;
    currentBytes += charBytes;
  }
  if (current) parts.push(current);

  return parts.join('\r\n ');
}

function icsLine(name: string, value: string): string {
  return foldIcsLine(`${name}:${escapeIcsText(value)}`);
}

/**
 * Serialize the event as an iCalendar document. `now` is injectable so `DTSTAMP` is
 * deterministic under test.
 */
export function buildIcsContent(event: CalendarEvent, now: Date = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Properfy//Inspection Portal//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${toIcsStamp(now)}`,
    `DTSTART:${toIcsStamp(event.startUtc)}`,
    `DTEND:${toIcsStamp(event.endUtc)}`,
    icsLine('SUMMARY', event.title),
    icsLine('DESCRIPTION', event.description),
    icsLine('LOCATION', event.location),
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR',
  ];

  return `${lines.join('\r\n')}\r\n`;
}

/** Google Calendar's prefilled-event template. Takes UTC stamps in a `start/end` pair. */
export function buildGoogleCalendarUrl(event: CalendarEvent): string {
  const url = new URL('https://calendar.google.com/calendar/render');
  url.searchParams.set('action', 'TEMPLATE');
  url.searchParams.set('text', event.title);
  url.searchParams.set('dates', `${toIcsStamp(event.startUtc)}/${toIcsStamp(event.endUtc)}`);
  url.searchParams.set('details', event.description);
  url.searchParams.set('location', event.location);
  return url.toString();
}

/** Outlook Web's compose deeplink. Takes ISO instants rather than compact stamps. */
export function buildOutlookCalendarUrl(event: CalendarEvent): string {
  const url = new URL('https://outlook.live.com/calendar/0/deeplink/compose');
  url.searchParams.set('path', '/calendar/action/compose');
  url.searchParams.set('rru', 'addevent');
  url.searchParams.set('subject', event.title);
  url.searchParams.set('startdt', event.startUtc.toISOString());
  url.searchParams.set('enddt', event.endUtc.toISOString());
  url.searchParams.set('body', event.description);
  url.searchParams.set('location', event.location);
  return url.toString();
}
