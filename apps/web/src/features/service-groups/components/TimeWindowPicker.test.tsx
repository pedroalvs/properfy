import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TimeWindowPicker } from './TimeWindowPicker';

describe('TimeWindowPicker', () => {
  it('renders start and end time inputs', () => {
    render(
      <TimeWindowPicker
        startTime="08:00"
        endTime="17:00"
        onStartTimeChange={vi.fn()}
        onEndTimeChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Start time')).toBeInTheDocument();
    expect(screen.getByLabelText('End time')).toBeInTheDocument();
  });

  it('displays current values', () => {
    render(
      <TimeWindowPicker
        startTime="09:00"
        endTime="18:00"
        onStartTimeChange={vi.fn()}
        onEndTimeChange={vi.fn()}
      />,
    );
    expect((screen.getByLabelText('Start time') as HTMLInputElement).value).toBe('09:00');
    expect((screen.getByLabelText('End time') as HTMLInputElement).value).toBe('18:00');
  });

  it('calls onStartTimeChange when start time changes', () => {
    const onStart = vi.fn();
    render(
      <TimeWindowPicker
        startTime="08:00"
        endTime="17:00"
        onStartTimeChange={onStart}
        onEndTimeChange={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '10:00' } });
    expect(onStart).toHaveBeenCalledWith('10:00');
  });

  it('calls onEndTimeChange when end time changes', () => {
    const onEnd = vi.fn();
    render(
      <TimeWindowPicker
        startTime="08:00"
        endTime="17:00"
        onStartTimeChange={vi.fn()}
        onEndTimeChange={onEnd}
      />,
    );
    fireEvent.change(screen.getByLabelText('End time'), { target: { value: '19:00' } });
    expect(onEnd).toHaveBeenCalledWith('19:00');
  });

  it('renders labels', () => {
    render(
      <TimeWindowPicker
        startTime=""
        endTime=""
        onStartTimeChange={vi.fn()}
        onEndTimeChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Start Time')).toBeInTheDocument();
    expect(screen.getByText('End Time')).toBeInTheDocument();
  });
});
