import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuditLogDetailDrawer } from './AuditLogDetailDrawer';
import type { AuditLog } from '../types';

const MOCK_LOG: AuditLog = {
  id: 'log-01', tenantId: 'ten-1', actorType: 'USER', actorId: 'usr-1',
  entityType: 'APPOINTMENT', entityId: 'apt-01', action: 'appointment.status_transition',
  reason: 'Released to inspector', beforeJson: { status: 'DRAFT' },
  afterJson: { status: 'AWAITING_INSPECTOR' }, requestId: 'req-1',
  ipAddress: '127.0.0.1', metadataJson: null, createdAt: '2026-03-17T10:00:00Z',
};

describe('AuditLogDetailDrawer', () => {
  it('renders title', () => {
    render(<AuditLogDetailDrawer log={MOCK_LOG} open onClose={vi.fn()} />);
    expect(screen.getByText('Audit Log Detail')).toBeInTheDocument();
  });

  it('renders log details', () => {
    render(<AuditLogDetailDrawer log={MOCK_LOG} open onClose={vi.fn()} />);
    expect(screen.getByText('APPOINTMENT')).toBeInTheDocument();
    expect(screen.getByText('Appointment Status Transition')).toBeInTheDocument();
    expect(screen.getByText('ten-1')).toBeInTheDocument();
    expect(screen.getByText('User (usr-1)')).toBeInTheDocument();
    expect(screen.getByText('status')).toBeInTheDocument();
    expect(screen.getByText('Released to inspector')).toBeInTheDocument();
  });

  it('renders before/after JSON blocks', () => {
    render(<AuditLogDetailDrawer log={MOCK_LOG} open onClose={vi.fn()} />);
    expect(screen.getByText('Before')).toBeInTheDocument();
    expect(screen.getByText('After')).toBeInTheDocument();
  });

  it('renders nothing when log is null', () => {
    render(<AuditLogDetailDrawer log={null} open onClose={vi.fn()} />);
    expect(screen.queryByText('APPOINTMENT')).not.toBeInTheDocument();
  });
});
