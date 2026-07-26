import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AvailableGroupsList } from './AvailableGroupsList';
import type { AvailableGroup } from '@properfy/shared';

const GROUP: AvailableGroup = {
  groupId: 'group-1',
  scheduledDate: '2026-06-15',
  timeSlotStart: '09:00',
  timeSlotEnd: '12:00',
  suburb: 'Surry Hills',
  inspectorName: 'John Smith',
  confirmedCount: 3,
  capacityMax: 10,
};

describe('AvailableGroupsList', () => {
  it('should show skeleton rows while loading', () => {
    render(<AvailableGroupsList groups={[]} isLoading={true} onSelect={vi.fn()} />);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('should show empty message when groups is empty and not loading', () => {
    render(<AvailableGroupsList groups={[]} isLoading={false} onSelect={vi.fn()} />);
    expect(screen.getByText(/no available times nearby/i)).toBeTruthy();
  });

  it('should show error state with retry when isError is true', () => {
    const onRetry = vi.fn();
    render(<AvailableGroupsList groups={[]} isLoading={false} isError={true} onRetry={onRetry} onSelect={vi.fn()} />);
    expect(screen.getByText(/failed to load/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('should render group rows when groups provided', () => {
    render(<AvailableGroupsList groups={[GROUP]} isLoading={false} onSelect={vi.fn()} />);
    expect(screen.getByText(/Surry Hills/)).toBeTruthy();
    expect(screen.getByText('09:00 – 12:00')).toBeTruthy();
    expect(screen.getByText(/15\/06\/2026/)).toBeTruthy();
    expect(screen.getByText(/John Smith/)).toBeTruthy();
  });

  it('should call onSelect with slot tuple when a row is clicked', () => {
    const onSelect = vi.fn();
    render(<AvailableGroupsList groups={[GROUP]} isLoading={false} onSelect={onSelect} />);
    fireEvent.click(screen.getByTestId('group-row'));
    expect(onSelect).toHaveBeenCalledWith(GROUP);
  });

  it('should highlight selected slot tuple', () => {
    render(
      <AvailableGroupsList
        groups={[GROUP]}
        isLoading={false}
        selectedSlotKey="group-1|2026-06-15|09:00|12:00"
        onSelect={vi.fn()}
      />,
    );
    const row = screen.getByTestId('group-row');
    expect(row.className).toContain('border-real-estate');
  });

  it('should group slots by day tabs and filter rows by the active day', () => {
    const otherDay: AvailableGroup = {
      ...GROUP,
      groupId: 'group-2',
      scheduledDate: '2026-06-16',
      timeSlotStart: '13:00',
      timeSlotEnd: '15:00',
    };
    render(<AvailableGroupsList groups={[GROUP, otherDay]} isLoading={false} onSelect={vi.fn()} />);

    // First day active by default — only its slots are listed.
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('09:00 – 12:00')).toBeTruthy();
    expect(screen.queryByText('13:00 – 15:00')).toBeNull();

    fireEvent.click(tabs[1]!);
    expect(screen.getByText('13:00 – 15:00')).toBeTruthy();
    expect(screen.queryByText('09:00 – 12:00')).toBeNull();
  });
});
