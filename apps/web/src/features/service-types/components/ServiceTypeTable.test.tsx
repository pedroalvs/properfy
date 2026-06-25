import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ServiceTypeTable } from './ServiceTypeTable';
import type { ServiceType } from '../types';

const MOCK_DATA: ServiceType[] = [
  { id: 'st-01', code: 'ROUTINE_IN', name: 'Routine Ingoing', flowType: 'INGOING', requiresTenantConfirmation: true, status: 'ACTIVE', createdAt: '2026-03-01T10:00:00Z', updatedAt: '2026-03-01T10:00:00Z' },
  { id: 'st-02', code: 'OUTGOING', name: 'Outgoing Inspection', flowType: 'OUTGOING', requiresTenantConfirmation: false, status: 'INACTIVE', createdAt: '2026-03-02T10:00:00Z', updatedAt: '2026-03-02T10:00:00Z' },
];

describe('ServiceTypeTable', () => {
  it('renders column headers', () => {
    render(<ServiceTypeTable data={[]} />);
    expect(screen.getByText('Code')).toBeInTheDocument();
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Flow Type')).toBeInTheDocument();
    expect(screen.getByText('Confirmation')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('renders service type data', () => {
    render(<ServiceTypeTable data={MOCK_DATA} />);
    expect(screen.getByText('ROUTINE_IN')).toBeInTheDocument();
    expect(screen.getByText('Routine Ingoing')).toBeInTheDocument();
    expect(screen.getByText('Outgoing Inspection')).toBeInTheDocument();
  });

  it('renders flow type chips', () => {
    render(<ServiceTypeTable data={MOCK_DATA} />);
    expect(screen.getByText('Ingoing')).toBeInTheDocument();
    expect(screen.getByText('Outgoing')).toBeInTheDocument();
  });

  it('renders action buttons', () => {
    const onView = vi.fn();
    render(<ServiceTypeTable data={MOCK_DATA} onView={onView} />);
    const viewButtons = screen.getAllByLabelText('View');
    expect(viewButtons).toHaveLength(2);
  });
});
