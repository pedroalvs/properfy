import { PLATFORM_TIMEZONE } from '@properfy/shared';
import { buildAddressLabel } from '@/lib/address';
import {
  buildInspectionCalendarEvent,
  buildIcsContent,
  buildGoogleCalendarUrl,
  buildOutlookCalendarUrl,
} from '../lib/calendar';
import type { PortalAppointment } from '../types';

interface AddToCalendarActionsProps {
  appointment: PortalAppointment;
  /** Agency (tenant) display name, used in the event title and description. */
  agencyName?: string | null;
  /** IANA timezone the wall-clock slot belongs to. */
  timezone?: string | null;
}

/**
 * Lets the rental tenant put a confirmed inspection into their own calendar.
 *
 * The .ics download covers Apple Calendar and desktop Outlook; the two links cover the
 * web calendars, which cannot consume a local file. Renders nothing when the schedule
 * cannot be resolved into a real instant — a broken calendar entry is worse than none.
 */
export function AddToCalendarActions({
  appointment,
  agencyName,
  timezone,
}: AddToCalendarActionsProps) {
  const propertyAddress = appointment.property
    ? buildAddressLabel({
        street: appointment.property.street,
        suburb: appointment.property.suburb,
        state: appointment.property.state,
        postcode: appointment.property.postcode,
      })
    : null;

  const event = buildInspectionCalendarEvent({
    appointmentId: appointment.id,
    scheduledDate: appointment.scheduledDate,
    timeSlotStart: appointment.timeSlotStart,
    timeSlotEnd: appointment.timeSlotEnd,
    propertyAddress,
    propertyCode: appointment.property?.propertyCode ?? null,
    serviceTypeName: appointment.serviceType?.name ?? null,
    agencyName: agencyName ?? null,
    timezone: timezone || PLATFORM_TIMEZONE,
  });

  if (!event) return null;

  const fileName = `inspection-${appointment.property?.propertyCode ?? appointment.id}.ics`;

  const handleDownload = () => {
    const blob = new Blob([buildIcsContent(event)], {
      type: 'text/calendar;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <section
      aria-label="Add to calendar"
      className="rounded-xl border border-border-subtle bg-card-bg p-6"
    >
      <h2 className="text-base font-bold text-text-primary">Add to calendar</h2>
      <p className="mt-1 text-sm text-text-secondary">
        Save this inspection so you don&apos;t forget the date and time.
      </p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button type="button" onClick={handleDownload} className={ACTION_CLASS}>
          <i className="mdi mdi-calendar-plus text-lg" aria-hidden="true" />
          Download (.ics)
        </button>

        <a
          href={buildGoogleCalendarUrl(event)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Add to Google Calendar (opens in a new tab)"
          className={ACTION_CLASS}
        >
          <i className="mdi mdi-google text-lg" aria-hidden="true" />
          Google Calendar
        </a>

        <a
          href={buildOutlookCalendarUrl(event)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Add to Outlook (opens in a new tab)"
          className={ACTION_CLASS}
        >
          <i className="mdi mdi-microsoft-outlook text-lg" aria-hidden="true" />
          Outlook
        </a>
      </div>
    </section>
  );
}

/** Min height keeps the tap target at 44px on mobile (WCAG 2.5.5). */
const ACTION_CLASS =
  'flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg border ' +
  'border-[color-mix(in_srgb,var(--color-real-estate)_45%,white)] ' +
  'bg-[color-mix(in_srgb,var(--color-real-estate)_8%,white)] px-4 py-2 text-sm ' +
  'font-bold text-[color-mix(in_srgb,var(--color-real-estate)_85%,black)] ' +
  'hover:bg-[color-mix(in_srgb,var(--color-real-estate)_18%,white)] ' +
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-real-estate';
