import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InspectorStatus } from '@properfy/shared';
import { InspectorTable } from './InspectorTable';
import type { Inspector } from '../types';

function makeInspector(overrides: Partial<Inspector> = {}): Inspector {
  return {
    id: 'insp-1',
    name: 'Carlos Inspetor',
    email: 'carlos@inspecoes.com',
    phone: '11999999999',
    status: InspectorStatus.ACTIVE,
    regionsCount: 3,
    serviceTypesCount: 5,
    createdAt: '2026-01-10T10:00:00Z',
    updatedAt: '2026-01-10T10:00:00Z',
    ...overrides,
  };
}

describe('InspectorTable', () => {
  it('renders column headers', () => {
    render(<InspectorTable data={[]} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Email')).toBeInTheDocument();
    expect(screen.getByText('Phone')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Regions')).toBeInTheDocument();
    expect(screen.getByText('Services')).toBeInTheDocument();
  });

  it('renders inspector data (name, email, regions/services counts)', () => {
    const insp = makeInspector();
    render(<InspectorTable data={[insp]} />);
    expect(screen.getByText('Carlos Inspetor')).toBeInTheDocument();
    expect(screen.getByText('carlos@inspecoes.com')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders InspectorStatusChip', () => {
    const insp = makeInspector({ status: InspectorStatus.INACTIVE });
    render(<InspectorTable data={[insp]} />);
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('renders em dash for null phone', () => {
    const insp = makeInspector({ phone: null });
    render(<InspectorTable data={[insp]} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<InspectorTable data={[]} loading />);
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  it('shows empty state when no data', () => {
    render(<InspectorTable data={[]} />);
    expect(screen.getByText('No records found')).toBeInTheDocument();
  });

  it('shows error state', () => {
    render(<InspectorTable data={[]} error="Network error" />);
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('view action calls onView with correct inspector', async () => {
    const user = userEvent.setup();
    const onView = vi.fn();
    const insp = makeInspector();
    render(<InspectorTable data={[insp]} onView={onView} />);
    await user.click(screen.getByLabelText('View'));
    expect(onView).toHaveBeenCalledWith(insp);
  });

  it('does not render pencil edit action (014 FR-019b)', () => {
    const insp = makeInspector();
    render(<InspectorTable data={[insp]} />);
    expect(screen.queryByLabelText('Edit')).not.toBeInTheDocument();
  });
});
