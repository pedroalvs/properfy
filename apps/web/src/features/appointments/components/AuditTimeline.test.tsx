import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuditTimeline } from './AuditTimeline';
import type { AuditLogEntry } from '../hooks/useAppointmentAuditLog';

const MOCK_ENTRIES: AuditLogEntry[] = [
  {
    id: 'log-01',
    tenantId: 'ten-1',
    actorType: 'USER',
    actorId: 'usr-1',
    actorName: 'Jane Operator',
    entityType: 'APPOINTMENT',
    entityId: 'apt-01',
    action: 'appointment.status_transition',
    reason: null,
    beforeJson: { status: 'DRAFT' },
    afterJson: { status: 'SCHEDULED' },
    requestId: 'req-1',
    ipAddress: '127.0.0.1',
    metadataJson: null,
    createdAt: '2026-03-10T10:00:00Z',
  },
  {
    id: 'log-02',
    tenantId: 'ten-1',
    actorType: 'USER',
    actorId: 'usr-2',
    actorName: null,
    entityType: 'APPOINTMENT',
    entityId: 'apt-01',
    action: 'appointment.status_transition',
    reason: 'No longer needed',
    beforeJson: { status: 'SCHEDULED' },
    afterJson: { status: 'CANCELLED' },
    requestId: 'req-2',
    ipAddress: '127.0.0.1',
    metadataJson: null,
    createdAt: '2026-03-11T14:00:00Z',
  },
];

describe('AuditTimeline', () => {
  it('renders timeline entries with friendly action labels', () => {
    render(<AuditTimeline entries={MOCK_ENTRIES} />);
    expect(screen.getAllByText('Status Changed')).toHaveLength(2);
  });

  it('renders actor name when available', () => {
    render(<AuditTimeline entries={MOCK_ENTRIES} />);
    expect(screen.getByText(/Jane Operator/)).toBeInTheDocument();
  });

  it('falls back to truncated actorId when actorName is null', () => {
    render(<AuditTimeline entries={MOCK_ENTRIES} />);
    expect(screen.getByText(/User \(usr-2\.\.\.\)/)).toBeInTheDocument();
  });

  it('renders reason when present', () => {
    render(<AuditTimeline entries={MOCK_ENTRIES} />);
    expect(screen.getByText(/No longer needed/)).toBeInTheDocument();
  });

  it('renders changed fields summary with arrow', () => {
    render(<AuditTimeline entries={MOCK_ENTRIES} />);
    expect(screen.getByText(/Status: DRAFT \u2192 SCHEDULED/)).toBeInTheDocument();
    expect(screen.getByText(/Status: SCHEDULED \u2192 CANCELLED/)).toBeInTheDocument();
  });

  it('does not render reason when null', () => {
    render(<AuditTimeline entries={[MOCK_ENTRIES[0]!]} />);
    expect(screen.queryByText(/Reason:/)).not.toBeInTheDocument();
  });

  it('renders metadata badges when present', () => {
    const entryWithMeta: AuditLogEntry = {
      ...MOCK_ENTRIES[0]!,
      id: 'log-03',
      metadataJson: { pendingOperatorCrossCheck: true, requiresFinancialReview: true },
    };
    render(<AuditTimeline entries={[entryWithMeta]} />);
    expect(screen.getByText('Pending Cross-check')).toBeInTheDocument();
    expect(screen.getByText('Requires Financial Review')).toBeInTheDocument();
  });

  it('renders system actor label', () => {
    const systemEntry: AuditLogEntry = {
      ...MOCK_ENTRIES[0]!,
      id: 'log-04',
      actorType: 'SYSTEM',
      actorId: null,
      actorName: null,
    };
    render(<AuditTimeline entries={[systemEntry]} />);
    expect(screen.getByText(/System/)).toBeInTheDocument();
  });

  it('renders different icon styles per action type', () => {
    const entries: AuditLogEntry[] = [
      { ...MOCK_ENTRIES[0]!, id: 'a1', action: 'appointment.status_transition' },
      { ...MOCK_ENTRIES[0]!, id: 'a2', action: 'appointment.done_pending_crosscheck' },
    ];
    const { container } = render(<AuditTimeline entries={entries} />);
    expect(container.querySelector('.mdi-swap-horizontal')).toBeTruthy();
    expect(container.querySelector('.mdi-alert-circle')).toBeTruthy();
  });

  // The backend writes these under the `rental_tenant_portal.` prefix. The timeline
  // used to key on `tenant_portal.`, so every portal event fell through to the raw
  // action string and the default icon.
  it('renders friendly labels for rental tenant portal actions', () => {
    const entries: AuditLogEntry[] = [
      { ...MOCK_ENTRIES[0]!, id: 'p1', action: 'rental_tenant_portal.appointment_confirmed' },
      { ...MOCK_ENTRIES[0]!, id: 'p2', action: 'rental_tenant_portal.unavailability_reported' },
      { ...MOCK_ENTRIES[0]!, id: 'p3', action: 'rental_tenant_portal.contact_updated' },
      { ...MOCK_ENTRIES[0]!, id: 'p4', action: 'rental_tenant_portal.group_joined' },
    ];
    render(<AuditTimeline entries={entries} />);

    expect(screen.getByText('Tenant Confirmed')).toBeInTheDocument();
    expect(screen.getByText('Tenant Reported Unavailable')).toBeInTheDocument();
    expect(screen.getByText('Tenant Contact Updated')).toBeInTheDocument();
    expect(screen.getByText('Tenant Joined Group')).toBeInTheDocument();
  });

  // Portal audit actions were written under `tenant_portal.` until the RentalTenant
  // rename (2026-06-30). No migration rewrote audit_logs.action, so those rows are still
  // in the database and must keep their labels.
  it('still labels legacy tenant_portal.* rows written before the rename', () => {
    const entries: AuditLogEntry[] = [
      { ...MOCK_ENTRIES[0]!, id: 'l1', action: 'tenant_portal.appointment_confirmed' },
      { ...MOCK_ENTRIES[0]!, id: 'l2', action: 'tenant_portal.unavailability_reported' },
      { ...MOCK_ENTRIES[0]!, id: 'l3', action: 'tenant_portal.contact_updated' },
    ];
    render(<AuditTimeline entries={entries} />);

    expect(screen.getByText('Tenant Confirmed')).toBeInTheDocument();
    expect(screen.getByText('Tenant Reported Unavailable')).toBeInTheDocument();
    expect(screen.getByText('Tenant Contact Updated')).toBeInTheDocument();
  });

  it('gives legacy tenant_portal.* rows their icons too', () => {
    const entries: AuditLogEntry[] = [
      { ...MOCK_ENTRIES[0]!, id: 'l4', action: 'tenant_portal.unavailability_reported' },
    ];
    const { container } = render(<AuditTimeline entries={entries} />);

    expect(container.querySelector('.mdi-account-cancel')).toBeTruthy();
    expect(container.querySelector('.mdi-circle-small')).toBeFalsy();
  });

  it('gives rental tenant portal actions their own icons', () => {
    const entries: AuditLogEntry[] = [
      { ...MOCK_ENTRIES[0]!, id: 'p1', action: 'rental_tenant_portal.unavailability_reported' },
    ];
    const { container } = render(<AuditTimeline entries={entries} />);

    expect(container.querySelector('.mdi-account-cancel')).toBeTruthy();
    expect(container.querySelector('.mdi-circle-small')).toBeFalsy();
  });

  it('returns null for empty entries', () => {
    const { container } = render(<AuditTimeline entries={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows channel, template and reason on a failure row', () => {
    // summarizeChanges() bails without a beforeJson, and these audits only carry
    // `after` — so without a dedicated renderer the row reads "Notification
    // Failed to Send — by System · date" and nothing else, leaving the operator
    // to go hunting in the Notifications tab. That is the exact friction this
    // feature exists to remove.
    const entries: AuditLogEntry[] = [
      {
        id: 'log-detail',
        tenantId: 'ten-1',
        actorType: 'SYSTEM',
        actorId: null,
        actorName: null,
        entityType: 'Appointment',
        entityId: 'apt-01',
        action: 'notification.send_failed',
        reason: null,
        beforeJson: null,
        afterJson: {
          notificationId: 'e7c9a1f2-0000-4000-8000-000000000001',
          templateCode: 'INSPECTION_NOTICE_SMS',
          channel: 'SMS',
          failureReason: 'EMPTY_SMS_BODY',
          retryCount: 0,
        },
        requestId: null,
        ipAddress: null,
        metadataJson: null,
        createdAt: '2026-03-12T09:00:00Z',
      },
    ];

    render(<AuditTimeline entries={entries} />);

    expect(screen.getByText(/SMS/)).toBeInTheDocument();
    expect(screen.getByText(/INSPECTION_NOTICE_SMS/)).toBeInTheDocument();
    expect(screen.getByText(/EMPTY_SMS_BODY/)).toBeInTheDocument();
    // Raw IDs must not leak into the UI.
    expect(screen.queryByText(/e7c9a1f2/)).not.toBeInTheDocument();
  });

  it('labels notification failures so they read as incidents on the timeline', () => {
    const entries: AuditLogEntry[] = [
      {
        id: 'log-notif-1',
        tenantId: 'ten-1',
        actorType: 'SYSTEM',
        actorId: null,
        actorName: null,
        entityType: 'Appointment',
        entityId: 'apt-01',
        action: 'notification.send_failed',
        reason: null,
        beforeJson: null,
        afterJson: { templateCode: 'INSPECTION_NOTICE_SMS', channel: 'SMS', failureReason: 'EMPTY_SMS_BODY' },
        requestId: null,
        ipAddress: null,
        metadataJson: null,
        createdAt: '2026-03-12T09:00:00Z',
      },
      {
        id: 'log-notif-2',
        tenantId: 'ten-1',
        actorType: 'SYSTEM',
        actorId: null,
        actorName: null,
        entityType: 'Appointment',
        entityId: 'apt-01',
        action: 'notification.dispatch_failed',
        reason: null,
        beforeJson: null,
        afterJson: { targetStatus: 'SCHEDULED', error: 'sms provider exploded' },
        requestId: null,
        ipAddress: null,
        metadataJson: null,
        createdAt: '2026-03-12T09:01:00Z',
      },
    ];

    const { container } = render(<AuditTimeline entries={entries} />);

    expect(screen.getByText('Notification Failed to Send')).toBeInTheDocument();
    expect(screen.getByText('Notification Dispatch Failed')).toBeInTheDocument();
    // Both must read as errors, not as neutral activity.
    expect(container.querySelectorAll('.border-error').length).toBe(2);
  });

  // The Fy agent's note text is stored clean in the appointment `notes` column;
  // its authorship + timestamp live here in the history. The audit carries only
  // `after: { content }`, so — like notification failures — it needs a dedicated
  // renderer, otherwise the row would read "Note Added via Fy" and hide the
  // actual instruction the operator came here to read.
  const fyNoteEntry: AuditLogEntry = {
    id: 'log-fy-1',
    tenantId: 'ten-1',
    actorType: 'SYSTEM',
    actorId: 'api-key:k-1',
    actorName: null,
    entityType: 'Appointment',
    entityId: 'apt-01',
    action: 'fy.note_added',
    reason: null,
    beforeJson: null,
    afterJson: { content: 'Please call the tenant 30 minutes before arriving.' },
    requestId: null,
    ipAddress: null,
    metadataJson: null,
    createdAt: '2026-08-06T14:34:23.691Z',
  };

  it('labels and renders the note content for a Fy note entry', () => {
    render(<AuditTimeline entries={[fyNoteEntry]} />);
    expect(screen.getByText('Note Added via Fy')).toBeInTheDocument();
    expect(
      screen.getByText('Please call the tenant 30 minutes before arriving.'),
    ).toBeInTheDocument();
  });

  it('gives the Fy note entry its own icon (not the default dot)', () => {
    const { container } = render(<AuditTimeline entries={[fyNoteEntry]} />);
    expect(container.querySelector('.mdi-message-text')).toBeTruthy();
    expect(container.querySelector('.mdi-circle-small')).toBeFalsy();
  });

  it('preserves interior line breaks in the Fy note content', () => {
    // Server-side validation only trims the ends (`z.string().trim()`), so
    // interior newlines are valid and must survive rendering rather than
    // collapse to a single line.
    const multiline: AuditLogEntry = {
      ...fyNoteEntry,
      id: 'log-fy-2',
      afterJson: { content: 'Line one\nLine two' },
    };
    render(<AuditTimeline entries={[multiline]} />);
    const node = screen.getByText(/Line one/);
    expect(node.textContent).toBe('Line one\nLine two');
    expect(node.className).toContain('whitespace-pre-line');
  });
});
