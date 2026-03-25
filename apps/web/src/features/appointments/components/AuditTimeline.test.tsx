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
  it('renders timeline entries', () => {
    render(<AuditTimeline entries={MOCK_ENTRIES} />);
    expect(screen.getAllByText('Appointment Status Transition')).toHaveLength(2);
  });

  it('renders actor identifiers', () => {
    render(<AuditTimeline entries={MOCK_ENTRIES} />);
    expect(screen.getByText(/USER \(usr-1\)/)).toBeInTheDocument();
    expect(screen.getByText(/USER \(usr-2\)/)).toBeInTheDocument();
  });

  it('renders reason when present', () => {
    render(<AuditTimeline entries={MOCK_ENTRIES} />);
    expect(screen.getByText(/No longer needed/)).toBeInTheDocument();
  });

  it('renders changed fields summary when before and after are available', () => {
    render(<AuditTimeline entries={MOCK_ENTRIES} />);
    expect(screen.getByText(/Changed: status: DRAFT -> SCHEDULED/)).toBeInTheDocument();
    expect(screen.getByText(/Changed: status: SCHEDULED -> CANCELLED/)).toBeInTheDocument();
  });

  it('does not render reason when null', () => {
    render(<AuditTimeline entries={[MOCK_ENTRIES[0]!]} />);
    expect(screen.queryByText(/Reason:/)).not.toBeInTheDocument();
  });

  it('returns null for empty entries', () => {
    const { container } = render(<AuditTimeline entries={[]} />);
    expect(container.innerHTML).toBe('');
  });
});
