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

  it('renders layout container (cycle 4: floating card, full-viewport map)', () => {
    // Cycle 4: the layout root is `relative h-screen` — the map fills
    // the full viewport and the filter panel floats at position:fixed.
    render(
      <MapScreenLayout
        sidePanel={<div>Panel</div>}
        map={<div>Map</div>}
      />,
    );
    const layout = screen.getByTestId('map-screen-layout');
    expect(layout).toBeInTheDocument();
    expect(layout).toHaveClass('h-screen');
  });

  it('renders floating panel with position:fixed left-4 top-4 (cycle 4)', () => {
    // Cycle 4: panel is fixed-positioned, not an absolute overlay with a width prop.
    render(
      <MapScreenLayout
        sidePanel={<div>Panel</div>}
        map={<div>Map</div>}
      />,
    );
    const panel = screen.getByTestId('map-side-panel');
    expect(panel).toHaveClass('fixed');
    expect(panel).toHaveClass('left-4');
    expect(panel).toHaveClass('top-4');
    // Backdrop is REMOVED — the dark md:bg-black/30 overlay no longer exists.
    expect(document.querySelector('.md\\:bg-black\\/30')).toBeNull();
  });

  it('hides side panel completely when sidePanelOpen is false (026 cycle-1 devolução)', () => {
    // User smoke caught that the previous slide-out animation left the
    // panel visible during/after the transition. The fix removes the
    // panel from the DOM entirely so the map underneath is full-width
    // and no panel chrome leaks through.
    render(
      <MapScreenLayout
        sidePanel={<div>Panel content</div>}
        map={<div>Map</div>}
        sidePanelOpen={false}
      />,
    );
    expect(screen.queryByTestId('map-side-panel')).toBeNull();
    expect(screen.queryByText('Panel content')).toBeNull();
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
