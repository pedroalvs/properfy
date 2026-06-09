import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FinishingPanel } from '../FinishingPanel';

const { useGeolocationMock } = vi.hoisted(() => ({ useGeolocationMock: vi.fn() }));

vi.mock('../../hooks/useGeolocation', () => ({
  useGeolocation: (options: unknown) => useGeolocationMock(options),
}));

const CAPTURED_LOCATION = {
  latitude: -37.8136,
  longitude: 144.9631,
  accuracy: 5,
  capturedAt: '2026-03-18T10:00:00Z',
};

describe('FinishingPanel', () => {
  const onSubmit = vi.fn();

  beforeEach(() => {
    onSubmit.mockClear();
    useGeolocationMock.mockReset();
    useGeolocationMock.mockReturnValue({
      location: CAPTURED_LOCATION,
      status: 'success' as const,
      error: null,
      requestLocation: vi.fn(),
    });
  });

  function renderPanel(props: Partial<Parameters<typeof FinishingPanel>[0]> = {}) {
    return render(
      <FinishingPanel
        checklistCount={3}
        assetCount={2}
        notes="some notes"
        onSubmit={onSubmit}
        isSubmitting={false}
        {...props}
      />,
    );
  }

  it('auto-captures location on mount (symmetry with start)', () => {
    renderPanel();
    expect(useGeolocationMock).toHaveBeenCalledWith({ autoCapture: true });
  });

  it('shows a distance warning when far from the property', () => {
    // ~88km north of the captured location → well beyond the 200m threshold
    renderPanel({ propertyLatitude: -37.0, propertyLongitude: 144.9631 });
    expect(screen.getByTestId('distance-warning')).toBeInTheDocument();
  });

  it('does not show a distance warning when property coordinates are absent', () => {
    renderPanel({ propertyLatitude: null, propertyLongitude: null });
    expect(screen.queryByTestId('distance-warning')).not.toBeInTheDocument();
  });

  it('disables the submit button until a location is captured', () => {
    useGeolocationMock.mockReturnValue({
      location: null,
      status: 'requesting' as const,
      error: null,
      requestLocation: vi.fn(),
    });
    renderPanel();
    expect(screen.getByTestId('submit-button')).toBeDisabled();
  });

  it('submits the captured location when the button is clicked', async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(screen.getByTestId('submit-button'));
    expect(onSubmit).toHaveBeenCalledWith(CAPTURED_LOCATION);
  });
});
