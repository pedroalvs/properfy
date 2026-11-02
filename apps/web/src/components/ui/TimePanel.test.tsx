import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimePanel } from './TimePanel';

describe('TimePanel', () => {
  it('renders hour buttons, minute buttons, and meridiem toggle', () => {
    render(<TimePanel selected="09:00" onSelect={() => {}} />);

    expect(screen.getByRole('button', { name: 'Select AM' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Select PM' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '9 AM' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ':00' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ':15' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ':30' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: ':45' })).toBeInTheDocument();
  });

  it('marks current selection as active', () => {
    render(<TimePanel selected="14:30" onSelect={() => {}} />);

    expect(screen.getByRole('button', { name: 'Select PM' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '2 PM' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: ':30' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onSelect with canonical HH:mm when minute is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<TimePanel selected="09:00" onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: ':30' }));
    expect(onSelect).toHaveBeenCalledWith('09:30');
  });

  it('switches meridiem and updates canonical emission', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<TimePanel selected="09:00" onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: 'Select PM' }));
    await user.click(screen.getByRole('button', { name: ':15' }));
    expect(onSelect).toHaveBeenCalledWith('21:15');
  });

  it('calls onSelect on Confirm click', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<TimePanel selected="10:00" onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onSelect).toHaveBeenCalledWith('10:00');
  });

  it('calls onSelect when Now is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<TimePanel selected="" onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: 'Now' }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toMatch(/^\d{2}:\d{2}$/);
  });

  it('disables times earlier than min', () => {
    render(<TimePanel selected="10:00" min="10:30" onSelect={() => {}} />);

    // In AM: 1..9 AM should be disabled because 10:30 is min
    expect(screen.getByRole('button', { name: '9 AM' })).toBeDisabled();
    // For 10 AM, :00 and :15 are < 10:30, so they should be disabled
    expect(screen.getByRole('button', { name: ':00' })).toBeDisabled();
    expect(screen.getByRole('button', { name: ':15' })).toBeDisabled();
    // :30 and :45 are >= 10:30, so they should be enabled
    expect(screen.getByRole('button', { name: ':30' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: ':45' })).not.toBeDisabled();
  });
});
