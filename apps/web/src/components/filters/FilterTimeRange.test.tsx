import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterTimeRange } from './FilterTimeRange';

describe('FilterTimeRange', () => {
  it('renders start and end time inputs', () => {
    render(
      <FilterTimeRange
        label="Time"
        startTime=""
        endTime=""
        onStartChange={() => {}}
        onEndChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('Time - start')).toBeInTheDocument();
    expect(screen.getByLabelText('Time - end')).toBeInTheDocument();
  });

  it('calls onStartChange and onEndChange on time changes', () => {
    const onStartChange = vi.fn();
    const onEndChange = vi.fn();
    render(
      <FilterTimeRange
        label="Time"
        startTime=""
        endTime=""
        onStartChange={onStartChange}
        onEndChange={onEndChange}
      />,
    );
    fireEvent.change(screen.getByLabelText('Time - start'), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText('Time - end'), { target: { value: '17:00' } });
    expect(onStartChange).toHaveBeenCalledWith('09:00');
    expect(onEndChange).toHaveBeenCalledWith('17:00');
  });

  it('opens the native picker when either input is clicked', () => {
    render(
      <FilterTimeRange
        label="Time"
        startTime=""
        endTime=""
        onStartChange={() => {}}
        onEndChange={() => {}}
      />,
    );
    for (const name of ['Time - start', 'Time - end']) {
      const input = screen.getByLabelText(name) as HTMLInputElement;
      const showPickerSpy = vi.fn();
      input.showPicker = showPickerSpy;
      fireEvent.click(input);
      expect(showPickerSpy).toHaveBeenCalledTimes(1);
    }
  });

  it('is safe when showPicker is undefined (older browsers)', () => {
    render(
      <FilterTimeRange
        label="Time"
        startTime=""
        endTime=""
        onStartChange={() => {}}
        onEndChange={() => {}}
      />,
    );
    expect(() => fireEvent.click(screen.getByLabelText('Time - start'))).not.toThrow();
  });
});
