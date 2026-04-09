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

  it('returns null for empty entries', () => {
    const { container } = render(<AuditTimeline entries={[]} />);
    expect(container.innerHTML).toBe('');
  });
});
