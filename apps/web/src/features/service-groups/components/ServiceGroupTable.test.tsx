import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ServiceGroupStatus, PriorityMode } from '@properfy/shared';
import { ServiceGroupTable } from './ServiceGroupTable';
import type { ServiceGroup } from '../types';

function makeServiceGroup(overrides: Partial<ServiceGroup> = {}): ServiceGroup {
  return {
    id: 'sg-1',
    tenantId: 'tenant-1',
    name: 'Zona Sul SP',
    regionName: 'São Paulo - Sul',
    inspectorId: 'insp-1',
    inspectorName: 'Carlos Silva',
    status: ServiceGroupStatus.PUBLISHED,
    priorityMode: PriorityMode.STANDARD,
    appointmentsCount: 5,
    createdAt: '2026-01-10T10:00:00Z',
    updatedAt: '2026-01-10T10:00:00Z',
    ...overrides,
  };
}

describe('ServiceGroupTable', () => {
  it('renders column headers', () => {
    render(<ServiceGroupTable data={[]} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Region')).toBeInTheDocument();
    expect(screen.getByText('Inspector')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Priority')).toBeInTheDocument();
    expect(screen.getByText('Appointments')).toBeInTheDocument();
  });

  it('renders service group data (name, regionName, appointmentsCount)', () => {
    const sg = makeServiceGroup();
    render(<ServiceGroupTable data={[sg]} />);
    expect(screen.getByText('Zona Sul SP')).toBeInTheDocument();
    expect(screen.getByText('São Paulo - Sul')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('renders ServiceGroupStatusChip for status', () => {
    const sg = makeServiceGroup({ status: ServiceGroupStatus.ACCEPTED });
    render(<ServiceGroupTable data={[sg]} />);
    expect(screen.getByText('Accepted')).toBeInTheDocument();
  });

  it('renders priority mode chip', () => {
    const sg = makeServiceGroup({ priorityMode: PriorityMode.PRIORITY_24H });
    render(<ServiceGroupTable data={[sg]} />);
    expect(screen.getByText('24h Priority')).toBeInTheDocument();
  });

  it('renders em dash for null regionName', () => {
    const sg = makeServiceGroup({ regionName: null });
    render(<ServiceGroupTable data={[sg]} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('renders em dash for null inspectorName', () => {
    const sg = makeServiceGroup({ inspectorName: null });
    render(<ServiceGroupTable data={[sg]} />);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(1);
  });

  it('shows loading state', () => {
    render(<ServiceGroupTable data={[]} loading />);
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  it('shows empty state when no data', () => {
    render(<ServiceGroupTable data={[]} />);
    expect(screen.getByText('No records found')).toBeInTheDocument();
  });

  it('shows error state', () => {
    render(<ServiceGroupTable data={[]} error="Network error" />);
    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('view action calls onView with correct service group', async () => {
    const user = userEvent.setup();
    const onView = vi.fn();
    const sg = makeServiceGroup();
    render(<ServiceGroupTable data={[sg]} onView={onView} />);
    await user.click(screen.getByLabelText('View'));
    expect(onView).toHaveBeenCalledWith(sg);
  });

  it('edit action calls onEdit with correct service group', async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const sg = makeServiceGroup();
    render(<ServiceGroupTable data={[sg]} onEdit={onEdit} />);
    await user.click(screen.getByLabelText('Edit'));
    expect(onEdit).toHaveBeenCalledWith(sg);
  });
});
