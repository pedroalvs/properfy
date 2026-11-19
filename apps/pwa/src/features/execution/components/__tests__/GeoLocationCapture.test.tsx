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

  it('uses the platform default radius (300 m), not the old 200 m, when no radius is given', () => {
    // ~250 m north of the property: inside 300 m (no warning) but outside 200 m
    // (would have warned under the old hard-coded threshold).
    render(
      <GeoLocationCapture
        status="success"
        location={{ latitude: -37.8, longitude: 144.9, accuracy: 5, capturedAt: '2026-03-18T10:00:00Z' }}
        error={null}
        onRequest={vi.fn()}
        propertyLatitude={-37.79775}
        propertyLongitude={144.9}
      />,
    );

    expect(screen.queryByTestId('distance-warning')).not.toBeInTheDocument();
  });

  it('warns against the server radius and names the limit', () => {
    // ~180 m from the property with a 150 m radius → warns.
    render(
      <GeoLocationCapture
        status="success"
        location={{ latitude: -37.8, longitude: 144.9, accuracy: 5, capturedAt: '2026-03-18T10:00:00Z' }}
        error={null}
        onRequest={vi.fn()}
        propertyLatitude={-37.80162}
        propertyLongitude={144.9}
        radiusMeters={150}
      />,
    );

    const warning = screen.getByTestId('distance-warning');
    expect(warning).toHaveTextContent(/from the property \(limit 150 m\)/);
    // Warning only — nothing is disabled by distance/BLOCK (the server enforces BLOCK).
    expect(screen.queryByRole('button', { name: /start|check in/i })).not.toBeInTheDocument();
  });
});
