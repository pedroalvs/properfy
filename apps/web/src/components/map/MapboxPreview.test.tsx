import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MapboxPreview } from './MapboxPreview';

vi.mock('../../config/env', () => ({
  env: {
    apiBaseUrl: 'http://localhost:3000',
    mapboxToken: '',
  },
}));

import { env } from '../../config/env';

const mockedEnv = env as { mapboxToken: string };

describe('MapboxPreview', () => {
  beforeEach(() => {
    mockedEnv.mapboxToken = '';
  });

  it('renders fallback with coordinates when no token is configured', () => {
    render(<MapboxPreview latitude={-23.550520} longitude={-46.633308} />);

    expect(screen.getByTestId('mapbox-fallback')).toBeInTheDocument();
    expect(screen.getByText('-23.550520, -46.633308')).toBeInTheDocument();
  });

  it('renders static map image when token is configured', () => {
    mockedEnv.mapboxToken = 'pk.test_token';

    render(<MapboxPreview latitude={-23.550520} longitude={-46.633308} />);

    const img = screen.getByTestId('mapbox-static-image');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', expect.stringContaining('api.mapbox.com'));
    expect(img).toHaveAttribute('src', expect.stringContaining('pk.test_token'));
  });

  it('shows Google Maps link by default', () => {
    render(<MapboxPreview latitude={-23.550520} longitude={-46.633308} />);

    const link = screen.getByTestId('google-maps-link');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute(
      'href',
      'https://www.google.com/maps?q=-23.55052,-46.633308',
    );
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveTextContent('Open in Google Maps');
  });

  it('hides Google Maps link when showGoogleMapsLink is false', () => {
    render(
      <MapboxPreview
        latitude={-23.550520}
        longitude={-46.633308}
        showGoogleMapsLink={false}
      />,
    );

    expect(screen.queryByTestId('google-maps-link')).not.toBeInTheDocument();
  });

  it('applies custom height', () => {
    render(
      <MapboxPreview latitude={-23.550520} longitude={-46.633308} height={300} />,
    );

    const fallback = screen.getByTestId('mapbox-fallback');
    expect(fallback).toHaveStyle({ height: '300px' });
  });

  it('applies default height of 200px', () => {
    render(<MapboxPreview latitude={-23.550520} longitude={-46.633308} />);

    const fallback = screen.getByTestId('mapbox-fallback');
    expect(fallback).toHaveStyle({ height: '200px' });
  });
});
