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

  it('renders label always even when times are empty', () => {
    render(
      <FilterTimeRange
        label="Time"
        startTime=""
        endTime=""
        onStartChange={() => {}}
        onEndChange={() => {}}
      />,
    );
    expect(screen.getByText('Time')).toBeInTheDocument();
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


  it('opens a time popover when a time field is clicked', async () => {
    render(
      <FilterTimeRange
        label="Time"
        startTime=""
        endTime=""
        onStartChange={() => {}}
        onEndChange={() => {}}
      />,
    );

    expect(screen.queryByRole('dialog', { name: 'Choose time' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Time - start'));
    expect(await screen.findByRole('dialog', { name: 'Choose time' })).toBeInTheDocument();
  });

  it('selects time from the popover and calls onStartChange', async () => {
    const onStartChange = vi.fn();
    render(
      <FilterTimeRange
        label="Time"
        startTime="09:00"
        endTime=""
        onStartChange={onStartChange}
        onEndChange={() => {}}
      />,
    );

    fireEvent.click(screen.getByLabelText('Time - start'));
    const dialog = await screen.findByRole('dialog', { name: 'Choose time' });
    expect(dialog).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: ':30' }));
    expect(onStartChange).toHaveBeenCalledWith('09:30');
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
