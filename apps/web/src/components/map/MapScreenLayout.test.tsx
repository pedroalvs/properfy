import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MapScreenLayout } from './MapScreenLayout';

describe('MapScreenLayout', () => {
  it('renders side panel and map area', () => {
    render(
      <MapScreenLayout
        sidePanel={<div>Side Panel Content</div>}
        map={<div>Map Content</div>}
      />,
    );
    expect(screen.getByText('Side Panel Content')).toBeInTheDocument();
    expect(screen.getByText('Map Content')).toBeInTheDocument();
  });

  it('renders layout container', () => {
    render(
      <MapScreenLayout
        sidePanel={<div>Panel</div>}
        map={<div>Map</div>}
      />,
    );
    expect(screen.getByTestId('map-screen-layout')).toBeInTheDocument();
  });

  it('renders side panel with default width', () => {
    render(
      <MapScreenLayout
        sidePanel={<div>Panel</div>}
        map={<div>Map</div>}
      />,
    );
    const panel = screen.getByTestId('map-side-panel');
    expect(panel).toHaveStyle({ width: '400px' });
  });

  it('hides side panel when sidePanelOpen is false', () => {
    render(
      <MapScreenLayout
        sidePanel={<div>Panel</div>}
        map={<div>Map</div>}
        sidePanelOpen={false}
      />,
    );
    const panel = screen.getByTestId('map-side-panel');
    expect(panel).toHaveStyle({ width: '0' });
  });

  it('renders map area', () => {
    render(
      <MapScreenLayout
        sidePanel={<div>Panel</div>}
        map={<div>Map</div>}
      />,
    );
    expect(screen.getByTestId('map-area')).toBeInTheDocument();
  });
});
