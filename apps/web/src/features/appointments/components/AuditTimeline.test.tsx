import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuditTimeline } from './AuditTimeline';
import type { AuditLogEntry } from '../hooks/useAppointmentAuditLog';

const MOCK_ENTRIES: AuditLogEntry[] = [
  {
    id: 'log-01',
    event: 'Status changed to SCHEDULED',
    actorName: 'Admin User',
    reason: null,
    createdAt: '2026-03-10T10:00:00Z',
  },
  {
    id: 'log-02',
    event: 'Status changed to CANCELLED',
    actorName: 'Client Admin',
    reason: 'No longer needed',
    createdAt: '2026-03-11T14:00:00Z',
  },
];

describe('AuditTimeline', () => {
  it('renders timeline entries', () => {
    render(<AuditTimeline entries={MOCK_ENTRIES} />);
    expect(screen.getByText('Status changed to SCHEDULED')).toBeInTheDocument();
    expect(screen.getByText('Status changed to CANCELLED')).toBeInTheDocument();
  });

  it('renders actor names', () => {
    render(<AuditTimeline entries={MOCK_ENTRIES} />);
    expect(screen.getByText(/Admin User/)).toBeInTheDocument();
    expect(screen.getByText(/Client Admin/)).toBeInTheDocument();
  });

  it('renders reason when present', () => {
    render(<AuditTimeline entries={MOCK_ENTRIES} />);
    expect(screen.getByText(/No longer needed/)).toBeInTheDocument();
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
