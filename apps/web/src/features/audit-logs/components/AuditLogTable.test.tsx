import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuditLogTable } from './AuditLogTable';
import type { AuditLog } from '../types';

const MOCK_DATA: AuditLog[] = [
  { id: 'log-01', tenantId: 'ten-1', tenantName: 'Acme Realty', actorType: 'USER', actorId: 'usr-1', actorName: 'Jane Operator', entityType: 'APPOINTMENT', entityId: 'apt-01', entityName: '#12', action: 'appointment.status_transition', reason: 'Released', beforeJson: { status: 'DRAFT' }, afterJson: { status: 'AWAITING_INSPECTOR' }, requestId: 'req-1', ipAddress: '127.0.0.1', metadataJson: null, createdAt: '2026-03-17T10:00:00Z' },
];

describe('AuditLogTable', () => {
  it('renders column headers', () => {
    render(<AuditLogTable data={[]} />);
    expect(screen.getByText('Timestamp')).toBeInTheDocument();
    expect(screen.getByText('Actor')).toBeInTheDocument();
    expect(screen.getByText('Agency')).toBeInTheDocument();
    expect(screen.getByText('Entity Type')).toBeInTheDocument();
    expect(screen.getByText('Entity')).toBeInTheDocument();
    expect(screen.getByText('Action')).toBeInTheDocument();
    expect(screen.getByText('Changed Fields')).toBeInTheDocument();
    expect(screen.getByText('Reason')).toBeInTheDocument();
  });

  it('renders audit log data with readable labels (no raw ids)', () => {
    render(<AuditLogTable data={MOCK_DATA} />);
    expect(screen.getByText('APPOINTMENT')).toBeInTheDocument();
    expect(screen.getByText('Appointment Status Transition')).toBeInTheDocument();
    // W2: actor/agency show the resolved names, never the raw ids.
    expect(screen.getByText('Jane Operator')).toBeInTheDocument();
    expect(screen.getByText('Acme Realty')).toBeInTheDocument();
    expect(screen.queryByText('usr-1')).toBeNull();
    expect(screen.queryByText('ten-1')).toBeNull();
    // W1: the Entity column shows the label, never the entityId UUID.
    expect(screen.getByText('#12')).toBeInTheDocument();
    expect(screen.queryByText('apt-01')).toBeNull();
    expect(screen.getByText('Released')).toBeInTheDocument();
  });

  it('W1 #409 tripwire: a null entityName never renders the raw entityId', () => {
    const row: AuditLog = {
      ...MOCK_DATA[0]!,
      id: 'log-02',
      entityType: 'ServiceGroup',
      entityId: 'a1b2c3d4-0000-4000-8000-000000000001',
      entityName: null,
    };
    render(<AuditLogTable data={[row]} />);
    expect(screen.queryByText('a1b2c3d4-0000-4000-8000-000000000001')).toBeNull();
    expect(screen.getByText('ServiceGroup')).toBeInTheDocument();
  });

  it('renders view action button', () => {
    const onView = vi.fn();
    render(<AuditLogTable data={MOCK_DATA} onView={onView} />);
    expect(screen.getByLabelText('View')).toBeInTheDocument();
  });
});
