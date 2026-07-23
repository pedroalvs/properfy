import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChangeTimeSheet } from './ChangeTimeSheet';
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

function renderSheet(overrides: Partial<React.ComponentProps<typeof ChangeTimeSheet>> = {}) {
  const props: React.ComponentProps<typeof ChangeTimeSheet> = {
    open: true,
    onClose: vi.fn(),
    groups: [GROUP],
    onSelect: vi.fn(),
    onJoin: vi.fn(),
    ...overrides,
  };
  return { ...render(<ChangeTimeSheet {...props} />), props };
}

describe('ChangeTimeSheet', () => {
  it('renders nothing when closed', () => {
    renderSheet({ open: false });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders the picker title and slot rows when open', () => {
    renderSheet();
    expect(screen.getByText('Pick a time for your booking')).toBeInTheDocument();
    expect(screen.getByTestId('group-row')).toBeInTheDocument();
  });

  it('focuses the sheet on open', () => {
    renderSheet();
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
  });

  it('does not steal focus back on unrelated re-renders while open (new onClose ref)', () => {
    const { rerender, props } = renderSheet();
    const row = screen.getByTestId('group-row');
    row.focus();

    // Parent re-render with a fresh inline onClose lambda + selection state change.
    rerender(
      <ChangeTimeSheet {...props} onClose={() => {}} selectedSlotKey="group-1|2026-06-15|09:00|12:00" />,
    );

    expect(document.activeElement).toBe(screen.getByTestId('group-row'));
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    renderSheet({ onClose });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('shows the join button only when a slot is selected and forwards the click', () => {
    const onJoin = vi.fn();
    const { rerender, props } = renderSheet({ onJoin });
    expect(screen.queryByRole('button', { name: 'Join this time slot' })).toBeNull();

    rerender(
      <ChangeTimeSheet {...props} selectedSlotKey="group-1|2026-06-15|09:00|12:00" />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Join this time slot' }));
    expect(onJoin).toHaveBeenCalledOnce();
  });

  it('renders the join error message', () => {
    renderSheet({ joinErrorMessage: 'This time is no longer available.' });
    expect(screen.getByRole('alert')).toHaveTextContent('This time is no longer available.');
  });
});
