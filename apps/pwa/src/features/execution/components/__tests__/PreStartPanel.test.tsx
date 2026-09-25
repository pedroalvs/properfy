import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PreStartPanel } from '../PreStartPanel';
import type { CapturedLocation } from '../../types';

type GeoStatus = 'idle' | 'requesting' | 'success' | 'error' | 'denied';
interface GeoState {
  location: CapturedLocation | null;
  status: GeoStatus;
  error: string | null;
  requestLocation: () => void;
}

const CAPTURED: CapturedLocation = {
  latitude: -37.8,
  longitude: 144.9,
  accuracy: 5,
  capturedAt: '2026-03-18T10:00:00Z',
};

const geo = vi.hoisted(() => ({
  current: {} as GeoState,
}));

vi.mock('../../hooks/useGeolocation', () => ({
  useGeolocation: () => geo.current,
}));

function setGeo(next: GeoState) {
  geo.current = next;
}

describe('PreStartPanel', () => {
  const onStart = vi.fn();

  beforeEach(() => {
    onStart.mockClear();
    // Default: location captured successfully (the happy path).
    setGeo({ location: CAPTURED, status: 'success', error: null, requestLocation: vi.fn() });
  });

  it('renders property address', () => {
    render(<PreStartPanel propertyAddress="123 Main St" onStart={onStart} isStarting={false} />);
    expect(screen.getByText('123 Main St')).toBeInTheDocument();
  });

  it('shows address confirmation checkbox', () => {
    render(<PreStartPanel propertyAddress="123 Main St" onStart={onStart} isStarting={false} />);
    expect(screen.getByTestId('address-confirm-checkbox')).toBeInTheDocument();
    expect(screen.getByText('I confirm I am at this address')).toBeInTheDocument();
  });

  it('disables start button until address is confirmed', () => {
    render(<PreStartPanel propertyAddress="123 Main St" onStart={onStart} isStarting={false} />);
    expect(screen.getByTestId('start-button')).toBeDisabled();
  });

  it('enables start button after address confirmation', async () => {
    const user = userEvent.setup();
    render(<PreStartPanel propertyAddress="123 Main St" onStart={onStart} isStarting={false} />);
    await user.click(screen.getByTestId('address-confirm-checkbox'));
    expect(screen.getByTestId('start-button')).not.toBeDisabled();
  });

  it('calls onStart when button is clicked after confirmation', async () => {
    const user = userEvent.setup();
    render(<PreStartPanel propertyAddress="123 Main St" onStart={onStart} isStarting={false} />);
    await user.click(screen.getByTestId('address-confirm-checkbox'));
    await user.click(screen.getByTestId('start-button'));
    expect(onStart).toHaveBeenCalledOnce();
  });

  it('does not show the location-required note once location is captured', () => {
    render(<PreStartPanel propertyAddress="123 Main St" onStart={onStart} isStarting={false} />);
    expect(screen.queryByTestId('location-required-note')).not.toBeInTheDocument();
  });

  // BUG-10-B: geolocation is mandatory to start. The address-confirm checkbox must
  // not imply it can bypass GPS; when location is denied/unavailable the panel must
  // make clear that location is required and keep Start disabled.
  describe('when geolocation is denied', () => {
    beforeEach(() => {
      setGeo({
        location: null,
        status: 'denied',
        error: 'Location permission denied. Enable location access to start.',
        requestLocation: vi.fn(),
      });
    });

    it('keeps the start button disabled even after the address is confirmed', async () => {
      const user = userEvent.setup();
      render(<PreStartPanel propertyAddress="123 Main St" onStart={onStart} isStarting={false} />);
      await user.click(screen.getByTestId('address-confirm-checkbox'));
      expect(screen.getByTestId('start-button')).toBeDisabled();
    });

    it('tells the inspector that location is required to start', async () => {
      const user = userEvent.setup();
      render(<PreStartPanel propertyAddress="123 Main St" onStart={onStart} isStarting={false} />);
      await user.click(screen.getByTestId('address-confirm-checkbox'));
      const note = screen.getByTestId('location-required-note');
      expect(note).toBeInTheDocument();
      expect(note).toHaveTextContent(/enable location/i);
    });

    it('never calls onStart while location is missing', async () => {
      const user = userEvent.setup();
      render(<PreStartPanel propertyAddress="123 Main St" onStart={onStart} isStarting={false} />);
      await user.click(screen.getByTestId('address-confirm-checkbox'));
      await user.click(screen.getByTestId('start-button'));
      expect(onStart).not.toHaveBeenCalled();
    });
  });

  describe('while geolocation is still being captured', () => {
    beforeEach(() => {
      setGeo({ location: null, status: 'requesting', error: null, requestLocation: vi.fn() });
    });

    it('shows a waiting-for-location note and keeps Start disabled', async () => {
      const user = userEvent.setup();
      render(<PreStartPanel propertyAddress="123 Main St" onStart={onStart} isStarting={false} />);
      await user.click(screen.getByTestId('address-confirm-checkbox'));
      expect(screen.getByTestId('location-required-note')).toBeInTheDocument();
      expect(screen.getByTestId('start-button')).toBeDisabled();
    });
  });
});
