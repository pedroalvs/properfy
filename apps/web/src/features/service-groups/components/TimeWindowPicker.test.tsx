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
    expect((screen.getByLabelText('Start time') as HTMLInputElement).value).toBe('9:00 am');
    expect((screen.getByLabelText('End time') as HTMLInputElement).value).toBe('6:00 pm');
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

  // T-C6-3b — minStartTime prop
  it('does not add min to start-time input when minStartTime is absent', () => {
    render(
      <TimeWindowPicker
        startTime="09:00"
        endTime="17:00"
        onStartTimeChange={vi.fn()}
        onEndTimeChange={vi.fn()}
      />,
    );
    const startInput = screen.getByLabelText('Start time') as HTMLInputElement;
    expect(startInput.min).toBe('');
  });

  it('exposes minStartTime on the start-time field', () => {
    render(
      <TimeWindowPicker
        startTime="09:00"
        endTime="17:00"
        onStartTimeChange={vi.fn()}
        onEndTimeChange={vi.fn()}
        minStartTime="14:30"
      />,
    );
    // `min` is not a valid attribute on a text input, so the bound is mirrored as
    // a data attribute; the field marks itself invalid rather than blocking input.
    const startInput = screen.getByLabelText('Start time') as HTMLInputElement;
    expect(startInput).toHaveAttribute('data-min', '14:30');
  });
});
