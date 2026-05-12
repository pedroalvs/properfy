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
    const layout = screen.getByTestId('map-screen-layout');
    expect(layout).toBeInTheDocument();
    expect(layout).toHaveClass('flex-col');
    expect(layout).toHaveClass('md:flex-row');
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
    expect(panel).toHaveStyle({ maxWidth: '100%' });
  });

  it('hides side panel when sidePanelOpen is false (026 overlay collapse)', () => {
    render(
      <MapScreenLayout
        sidePanel={<div>Panel</div>}
        map={<div>Map</div>}
        sidePanelOpen={false}
      />,
    );
    const panel = screen.getByTestId('map-side-panel');
    // 026 §FR-570 — collapse is OVERLAY (transform + opacity), not push.
    // The panel is `aria-hidden` and pointer-events-none so the map
    // underneath stays interactive.
    expect(panel.getAttribute('aria-hidden')).toBe('true');
    expect(panel.className).toContain('pointer-events-none');
    expect(panel.className).toContain('-translate-x-full');
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
