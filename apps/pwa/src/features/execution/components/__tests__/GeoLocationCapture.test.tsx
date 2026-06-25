import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GeoLocationCapture } from '../GeoLocationCapture';

describe('GeoLocationCapture', () => {
  it('shows retry action for denied geolocation state', async () => {
    const onRequest = vi.fn();
    const user = userEvent.setup();

    render(
      <GeoLocationCapture
        status="denied"
        location={null}
        error="Location permission denied."
        onRequest={onRequest}
      />,
    );

    await user.click(screen.getByTestId('geo-retry-button'));

    expect(onRequest).toHaveBeenCalledOnce();
  });

  it('shows distance warning when inspector is far from property', () => {
    render(
      <GeoLocationCapture
        status="success"
        location={{ latitude: -37.8, longitude: 144.9, accuracy: 5, capturedAt: '2026-03-18T10:00:00Z' }}
        error={null}
        onRequest={vi.fn()}
        propertyLatitude={-37.805}
        propertyLongitude={144.905}
      />,
    );

    expect(screen.getByTestId('distance-warning')).toBeInTheDocument();
    expect(screen.getByTestId('distance-warning')).toHaveTextContent(/from the property/);
  });

  it('does not show distance warning when inspector is close to property', () => {
    render(
      <GeoLocationCapture
        status="success"
        location={{ latitude: -37.8, longitude: 144.9, accuracy: 5, capturedAt: '2026-03-18T10:00:00Z' }}
        error={null}
        onRequest={vi.fn()}
        propertyLatitude={-37.8001}
        propertyLongitude={144.9001}
      />,
    );

    expect(screen.queryByTestId('distance-warning')).not.toBeInTheDocument();
  });

  it('does not show distance warning when property coordinates are missing', () => {
    render(
      <GeoLocationCapture
        status="success"
        location={{ latitude: -37.8, longitude: 144.9, accuracy: 5, capturedAt: '2026-03-18T10:00:00Z' }}
        error={null}
        onRequest={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('distance-warning')).not.toBeInTheDocument();
  });
});
