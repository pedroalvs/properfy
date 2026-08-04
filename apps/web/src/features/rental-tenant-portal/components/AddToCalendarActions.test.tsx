import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddToCalendarActions } from './AddToCalendarActions';
import type { PortalAppointment } from '../types';

const APPOINTMENT = {
  id: 'appt-1',
  status: 'SCHEDULED',
  scheduledDate: '2026-07-15',
  timeSlotStart: '09:00',
  timeSlotEnd: '11:00',
  rentalTenantConfirmationStatus: 'CONFIRMED',
  keyRequired: false,
  meetingLocation: null,
  notes: null,
  serviceType: { id: 'st-1', name: 'Routine Inspection', code: 'ROUTINE' },
  property: {
    id: 'prop-1',
    propertyCode: 'ACM-PROP-0007',
    type: 'HOUSE',
    street: '12 Bourke St',
    addressLine2: null,
    suburb: 'Surry Hills',
    postcode: '2010',
    state: 'NSW',
    country: 'AU',
  },
} as unknown as PortalAppointment;

/** jsdom's Blob has no `.text()`, so read it the long way. */
function readBlob(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

function renderActions(props: Partial<Parameters<typeof AddToCalendarActions>[0]> = {}) {
  return render(
    <AddToCalendarActions
      appointment={APPOINTMENT}
      agencyName="Acme Realty"
      timezone="Australia/Sydney"
      {...props}
    />,
  );
}

describe('AddToCalendarActions', () => {
  let createObjectURL: Mock;
  let revokeObjectURL: Mock;
  /** Anchors whose click() was intercepted, captured via `this`. */
  let clicked: HTMLAnchorElement[];

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:mock-url');
    revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, writable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, writable: true });

    clicked = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(
      function (this: HTMLAnchorElement) {
        clicked.push(this);
      },
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('offers all three calendar targets', () => {
    renderActions();

    expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /google calendar/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /outlook/i })).toBeInTheDocument();
  });

  it('points the Google link at the event with the correct UTC range', () => {
    renderActions();
    const href = screen.getByRole('link', { name: /google calendar/i }).getAttribute('href') ?? '';
    const url = new URL(href);

    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render');
    expect(url.searchParams.get('dates')).toBe('20260714T230000Z/20260715T010000Z');
  });

  it('points the Outlook link at the compose deeplink', () => {
    renderActions();
    const href = screen.getByRole('link', { name: /outlook/i }).getAttribute('href') ?? '';

    expect(new URL(href).origin).toBe('https://outlook.live.com');
  });

  it('opens the external calendars in a new tab without leaking the opener', () => {
    renderActions();

    for (const name of [/google calendar/i, /outlook/i]) {
      const link = screen.getByRole('link', { name });
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('rel')).toContain('noopener');
      expect(link.getAttribute('rel')).toContain('noreferrer');
      // A link that silently changes context must say so to a screen reader.
      expect(link.getAttribute('aria-label')).toMatch(/new tab/i);
    }
  });

  it('downloads an .ics file named after the property code', async () => {
    const user = userEvent.setup();
    renderActions();

    await user.click(screen.getByRole('button', { name: /download/i }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(blob.type).toContain('text/calendar');
    expect(await readBlob(blob)).toContain('BEGIN:VEVENT');

    expect(clicked).toHaveLength(1);
    expect(clicked[0]?.download).toBe('inspection-ACM-PROP-0007.ics');
    // The object URL must be released, or the blob is pinned for the page's lifetime.
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('falls back to the appointment id when the property has no code', async () => {
    const user = userEvent.setup();
    renderActions({
      appointment: { ...APPOINTMENT, property: null } as unknown as PortalAppointment,
    });

    await user.click(screen.getByRole('button', { name: /download/i }));

    expect(clicked[0]?.download).toBe('inspection-appt-1.ics');
  });

  it('renders nothing when the schedule cannot be resolved into an event', () => {
    const { container } = renderActions({
      appointment: { ...APPOINTMENT, scheduledDate: '' } as unknown as PortalAppointment,
    });

    expect(container).toBeEmptyDOMElement();
  });
});
