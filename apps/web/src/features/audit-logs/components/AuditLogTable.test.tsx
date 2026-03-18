import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuditLogTable } from './AuditLogTable';
import type { AuditLog } from '../types';

const MOCK_DATA: AuditLog[] = [
  { id: 'log-01', tenantId: 'ten-1', actorType: 'USER', actorId: 'usr-1', entityType: 'APPOINTMENT', entityId: 'apt-01', action: 'STATUS_TRANSITION', reason: 'Released', beforeJson: null, afterJson: null, requestId: 'req-1', ipAddress: '127.0.0.1', metadataJson: null, createdAt: '2026-03-17T10:00:00Z' },
];

describe('AuditLogTable', () => {
  it('renders column headers', () => {
    render(<AuditLogTable data={[]} />);
    expect(screen.getByText('Timestamp')).toBeInTheDocument();
    expect(screen.getByText('Actor')).toBeInTheDocument();
    expect(screen.getByText('Entity Type')).toBeInTheDocument();
    expect(screen.getByText('Action')).toBeInTheDocument();
    expect(screen.getByText('Reason')).toBeInTheDocument();
  });

  it('renders audit log data', () => {
    render(<AuditLogTable data={MOCK_DATA} />);
    expect(screen.getByText('APPOINTMENT')).toBeInTheDocument();
    expect(screen.getByText('STATUS_TRANSITION')).toBeInTheDocument();
    expect(screen.getByText('Released')).toBeInTheDocument();
  });

  it('renders view action button', () => {
    const onView = vi.fn();
    render(<AuditLogTable data={MOCK_DATA} onView={onView} />);
    expect(screen.getByLabelText('View')).toBeInTheDocument();
  });
});
