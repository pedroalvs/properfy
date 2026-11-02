import { render, screen } from '@testing-library/react';
import { PreStartPanel } from '../PreStartPanel';

// Avoid touching real geolocation; the panel auto-captures on mount.
vi.mock('../../hooks/useGeolocation', () => ({
  useGeolocation: () => ({
    location: null,
    status: 'idle' as const,
    error: null,
    requestLocation: vi.fn(),
  }),
}));

describe('PreStartPanel', () => {
  it('surfaces a server check-in rejection as a destructive alert and stays on the start panel', () => {
    render(
      <PreStartPanel
        propertyAddress="123 Main St"
        onStart={vi.fn()}
        isStarting={false}
        errorMessage="You are 640 m from the property. Check-in is only allowed within 300 m. If you are at the right address, contact operations."
      />,
    );

    expect(screen.getByTestId('start-error')).toHaveTextContent(/only allowed within 300 m/);
    // The panel itself is still rendered (PRE_START) with the Start control present.
    expect(screen.getByTestId('pre-start-panel')).toBeInTheDocument();
    expect(screen.getByTestId('start-button')).toBeInTheDocument();
  });

  it('shows no alert when there is no error', () => {
    render(<PreStartPanel propertyAddress="123 Main St" onStart={vi.fn()} isStarting={false} />);
    expect(screen.queryByTestId('start-error')).not.toBeInTheDocument();
  });
});
