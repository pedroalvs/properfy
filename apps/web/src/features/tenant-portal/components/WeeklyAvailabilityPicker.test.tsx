import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { WeeklyAvailabilityPicker } from './WeeklyAvailabilityPicker';
import type { AvailableSlot } from '@properfy/shared';

describe('WeeklyAvailabilityPicker', () => {
  it('should render all 7 day chips', () => {
    render(<WeeklyAvailabilityPicker value={[]} onChange={vi.fn()} />);
    for (const day of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
      expect(screen.getByText(day)).toBeTruthy();
    }
  });

  it('should add a slot with default times when a day chip is toggled on', () => {
    const onChange = vi.fn();
    render(<WeeklyAvailabilityPicker value={[]} onChange={onChange} />);

    fireEvent.click(screen.getByText('Mon'));

    expect(onChange).toHaveBeenCalledWith([
      { dayOfWeek: 'MON', start: '09:00', end: '17:00' },
    ]);
  });

  it('should remove a slot when its day chip is toggled off', () => {
    const slots: AvailableSlot[] = [{ dayOfWeek: 'MON', start: '09:00', end: '17:00' }];
    const onChange = vi.fn();
    render(<WeeklyAvailabilityPicker value={slots} onChange={onChange} />);

    // Use role=button to target the chip specifically (the time row also renders "Mon" as a span)
    fireEvent.click(screen.getByRole('button', { name: 'Mon' }));

    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('should call onChange with updated start time when start select changes', () => {
    const slots: AvailableSlot[] = [{ dayOfWeek: 'MON', start: '09:00', end: '17:00' }];
    const onChange = vi.fn();
    render(<WeeklyAvailabilityPicker value={slots} onChange={onChange} />);

    const startSelect = screen.getByTestId('start-MON');
    fireEvent.change(startSelect, { target: { value: '10:00' } });

    expect(onChange).toHaveBeenCalledWith([{ dayOfWeek: 'MON', start: '10:00', end: '17:00' }]);
  });

  it('should call onChange with updated end time when end select changes', () => {
    const slots: AvailableSlot[] = [{ dayOfWeek: 'WED', start: '09:00', end: '17:00' }];
    const onChange = vi.fn();
    render(<WeeklyAvailabilityPicker value={slots} onChange={onChange} />);

    const endSelect = screen.getByTestId('end-WED');
    fireEvent.change(endSelect, { target: { value: '12:00' } });

    expect(onChange).toHaveBeenCalledWith([{ dayOfWeek: 'WED', start: '09:00', end: '12:00' }]);
  });

  it('should be disabled when disabled prop is true', () => {
    render(<WeeklyAvailabilityPicker value={[]} onChange={vi.fn()} disabled />);
    const monChip = screen.getByText('Mon');
    expect(monChip.closest('button')).toBeDisabled();
  });

  it('should show time selects only for active days', () => {
    const slots: AvailableSlot[] = [{ dayOfWeek: 'FRI', start: '09:00', end: '17:00' }];
    render(<WeeklyAvailabilityPicker value={slots} onChange={vi.fn()} />);

    expect(screen.queryByTestId('start-MON')).toBeNull();
    expect(screen.getByTestId('start-FRI')).toBeTruthy();
  });

  it('should call onChange with full state when multiple days toggled', () => {
    const slots: AvailableSlot[] = [{ dayOfWeek: 'MON', start: '09:00', end: '12:00' }];
    const onChange = vi.fn();
    render(<WeeklyAvailabilityPicker value={slots} onChange={onChange} />);

    fireEvent.click(screen.getByText('Wed'));

    expect(onChange).toHaveBeenCalledWith([
      { dayOfWeek: 'MON', start: '09:00', end: '12:00' },
      { dayOfWeek: 'WED', start: '09:00', end: '17:00' },
    ]);
  });
});
