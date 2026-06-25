import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RecurrenceSelector } from './RecurrenceSelector';
import type { StructuredRecurrence } from '../types';

describe('RecurrenceSelector', () => {
  const dailyValue: StructuredRecurrence = { type: 'daily', hour: 8 };
  const weeklyValue: StructuredRecurrence = { type: 'weekly', dayOfWeek: 1, hour: 9 };
  const monthlyValue: StructuredRecurrence = { type: 'monthly', dayOfMonth: 15, hour: 10 };

  it('renders frequency selector', () => {
    render(<RecurrenceSelector value={dailyValue} onChange={vi.fn()} />);
    expect(screen.getByText('Daily')).toBeInTheDocument();
  });

  it('renders hour field', () => {
    render(<RecurrenceSelector value={dailyValue} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Hour')).toBeInTheDocument();
  });

  it('renders day-of-week selector for weekly recurrence', () => {
    render(<RecurrenceSelector value={weeklyValue} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Day of week')).toBeInTheDocument();
    expect(screen.getByText('Monday')).toBeInTheDocument();
  });

  it('renders day-of-month input for monthly recurrence', () => {
    render(<RecurrenceSelector value={monthlyValue} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Day of month')).toBeInTheDocument();
  });

  it('does not render day-of-week field for daily recurrence', () => {
    render(<RecurrenceSelector value={dailyValue} onChange={vi.fn()} />);
    expect(screen.queryByLabelText('Day of week')).not.toBeInTheDocument();
  });

  it('calls onChange when frequency is changed', async () => {
    const onChange = vi.fn();
    render(<RecurrenceSelector value={dailyValue} onChange={onChange} />);
    const trigger = screen.getByLabelText('Frequency');
    await userEvent.click(trigger);
    const weeklyOption = screen.getByText('Weekly');
    await userEvent.click(weeklyOption);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'weekly' }),
    );
  });

  it('renders as disabled when disabled prop is true', () => {
    render(<RecurrenceSelector value={dailyValue} onChange={vi.fn()} disabled />);
    const trigger = screen.getByLabelText('Frequency');
    expect(trigger).toBeDisabled();
  });
});
