import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AvailableGroupsList } from './AvailableGroupsList';
import type { AvailableGroup } from '@properfy/shared';

const GROUP: AvailableGroup = {
  id: 'group-1',
  scheduledDate: '2026-06-15',
  timeWindow: '09:00-12:00',
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
    expect(screen.getByText('Surry Hills')).toBeTruthy();
    expect(screen.getByText('09:00-12:00')).toBeTruthy();
    expect(screen.getByText('John Smith')).toBeTruthy();
  });

  it('should call onSelect with groupId when a row is clicked', () => {
    const onSelect = vi.fn();
    render(<AvailableGroupsList groups={[GROUP]} isLoading={false} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Surry Hills').closest('[data-testid="group-row"]')!);
    expect(onSelect).toHaveBeenCalledWith('group-1');
  });

  it('should highlight selected group', () => {
    render(
      <AvailableGroupsList groups={[GROUP]} isLoading={false} selectedGroupId="group-1" onSelect={vi.fn()} />,
    );
    const row = screen.getByTestId('group-row');
    expect(row.className).toContain('ring');
  });
});
