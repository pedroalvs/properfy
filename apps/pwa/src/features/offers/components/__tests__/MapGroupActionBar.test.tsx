import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MapGroupActionBar } from '../MapGroupActionBar';

describe('MapGroupActionBar', () => {
  const baseProps = {
    groupCode: '2042',
    appointmentCount: 3,
    loading: false,
    onReset: vi.fn(),
    onAccept: vi.fn(),
  };

  it('shows the human-friendly group code and inspection count, never a UUID', () => {
    render(<MapGroupActionBar {...baseProps} />);
    const bar = screen.getByTestId('map-group-action-bar');
    expect(bar).toHaveTextContent('Group 2042');
    expect(bar).toHaveTextContent('3 inspections');
    expect(bar.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });

  it('uses the singular label for a single inspection', () => {
    render(<MapGroupActionBar {...baseProps} appointmentCount={1} />);
    expect(screen.getByTestId('map-group-action-bar')).toHaveTextContent('1 inspection');
  });

  it('invokes onReset and onAccept from their buttons', () => {
    const onReset = vi.fn();
    const onAccept = vi.fn();
    render(<MapGroupActionBar {...baseProps} onReset={onReset} onAccept={onAccept} />);

    fireEvent.click(screen.getByTestId('map-reset-btn'));
    expect(onReset).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('map-accept-group-btn'));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('disables Accept and shows the loading hint while the detail loads', () => {
    const onAccept = vi.fn();
    render(<MapGroupActionBar {...baseProps} loading onAccept={onAccept} />);

    expect(screen.getByTestId('map-group-action-bar')).toHaveTextContent('Loading inspections…');
    expect(screen.getByTestId('map-accept-group-btn')).toBeDisabled();
  });
});
