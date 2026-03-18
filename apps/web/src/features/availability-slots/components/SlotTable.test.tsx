import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SlotTable } from './SlotTable';
import type { AvailabilitySlot } from '../types';

const MOCK_SLOTS: AvailabilitySlot[] = [
  {
    id: 'slot-01',
    inspectorId: 'insp-01',
    inspectorName: 'Diego',
    date: '2026-03-20',
    startTime: '08:00',
    endTime: '12:00',
    region: 'North Zone',
    capacity: 3,
    bookedCount: 1,
    status: 'AVAILABLE',
    createdAt: '2026-03-17T10:00:00Z',
  },
  {
    id: 'slot-02',
    inspectorId: 'insp-02',
    inspectorName: 'Carlos',
    date: '2026-03-21',
    startTime: '13:00',
    endTime: '17:00',
    region: 'South Zone',
    capacity: 2,
    bookedCount: 2,
    status: 'BOOKED',
    createdAt: '2026-03-17T11:00:00Z',
  },
];

describe('SlotTable', () => {
  it('renders column headers', () => {
    render(<SlotTable data={[]} />);
    expect(screen.getByText('Inspector')).toBeInTheDocument();
    expect(screen.getByText('Date')).toBeInTheDocument();
    expect(screen.getByText('Time')).toBeInTheDocument();
    expect(screen.getByText('Region')).toBeInTheDocument();
    expect(screen.getByText('Capacity')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  it('renders slot data', () => {
    render(<SlotTable data={MOCK_SLOTS} />);
    expect(screen.getByText('Diego')).toBeInTheDocument();
    expect(screen.getByText('Carlos')).toBeInTheDocument();
    expect(screen.getByText('North Zone')).toBeInTheDocument();
    expect(screen.getByText('South Zone')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getByText('Booked')).toBeInTheDocument();
  });

  it('renders capacity as booked/total', () => {
    render(<SlotTable data={MOCK_SLOTS} />);
    expect(screen.getByText('1/3')).toBeInTheDocument();
    expect(screen.getByText('2/2')).toBeInTheDocument();
  });

  it('renders time range', () => {
    render(<SlotTable data={MOCK_SLOTS} />);
    expect(screen.getByText('08:00 - 12:00')).toBeInTheDocument();
    expect(screen.getByText('13:00 - 17:00')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    render(<SlotTable data={[]} loading />);
    expect(screen.queryByText('Diego')).not.toBeInTheDocument();
  });

  it('calls onEdit on action click', async () => {
    const onEdit = vi.fn();
    render(<SlotTable data={MOCK_SLOTS} onEdit={onEdit} />);

    const editButtons = screen.getAllByLabelText('Edit');
    await userEvent.click(editButtons[0]!);

    expect(onEdit).toHaveBeenCalledWith(MOCK_SLOTS[0]);
  });
});
