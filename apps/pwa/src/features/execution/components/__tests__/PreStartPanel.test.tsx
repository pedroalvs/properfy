import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PreStartPanel } from '../PreStartPanel';

vi.mock('../../hooks/useGeolocation', () => ({
  useGeolocation: () => ({
    location: { latitude: -37.8, longitude: 144.9, accuracy: 5, capturedAt: '2026-03-18T10:00:00Z' },
    status: 'success' as const,
    error: null,
    requestLocation: vi.fn(),
  }),
}));

describe('PreStartPanel', () => {
  const onStart = vi.fn();

  beforeEach(() => {
    onStart.mockClear();
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
});
