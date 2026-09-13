import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuditLogDetailDrawer } from './AuditLogDetailDrawer';
import type { AuditLog } from '../types';

const MOCK_LOG: AuditLog = {
  id: 'log-01', tenantId: 'ten-1', tenantName: 'Acme Realty', actorType: 'USER', actorId: 'usr-1', actorName: 'Jane Operator',
  entityType: 'APPOINTMENT', entityId: 'apt-01', entityName: '#12', action: 'appointment.status_transition',
  reason: 'Released to inspector', beforeJson: { status: 'DRAFT' },
  afterJson: { status: 'AWAITING_INSPECTOR' }, requestId: 'req-1',
  ipAddress: '127.0.0.1', metadataJson: null, createdAt: '2026-03-17T10:00:00Z',
};

describe('AuditLogDetailDrawer', () => {
  it('renders title', () => {
    render(<AuditLogDetailDrawer log={MOCK_LOG} open onClose={vi.fn()} />);
    expect(screen.getByText('Audit Log Detail')).toBeInTheDocument();
  });

  it('renders resolved names/labels (matching the list), never raw ids', () => {
    render(<AuditLogDetailDrawer log={MOCK_LOG} open onClose={vi.fn()} />);
    expect(screen.getByText('APPOINTMENT')).toBeInTheDocument();
    expect(screen.getByText('Appointment Status Transition')).toBeInTheDocument();
    // W2 #423: the drawer passes the names, so it shows them (not the ids).
    expect(screen.getByText('Acme Realty')).toBeInTheDocument();
    expect(screen.getByText('Jane Operator')).toBeInTheDocument();
    expect(screen.queryByText('ten-1')).toBeNull();
    expect(screen.queryByText('User (usr-1)')).toBeNull();
    // W1 #409: entity label, never the entityId.
    expect(screen.getByText('#12')).toBeInTheDocument();
    expect(screen.queryByText('apt-01')).toBeNull();
    expect(screen.getByText('Released to inspector')).toBeInTheDocument();
  });

  it('shows readable fallbacks (no ids, no parentheses) when names are null', () => {
    const noNames: AuditLog = {
      ...MOCK_LOG,
      tenantName: null,
      actorName: null,
      entityName: null,
    };
    const { container } = render(<AuditLogDetailDrawer log={noNames} open onClose={vi.fn()} />);
    expect(screen.getByText('User')).toBeInTheDocument(); // actor type alone
    expect(screen.getByText('Unknown agency')).toBeInTheDocument();
    // No raw ids and no "( ... )" id-parenthetical anywhere in the DOM.
    expect(screen.queryByText('usr-1')).toBeNull();
    expect(screen.queryByText('ten-1')).toBeNull();
    expect(container.textContent).not.toContain('(usr-1)');
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
