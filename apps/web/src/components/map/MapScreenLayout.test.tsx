import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
    // `h-dvh` rather than `h-screen` — 100vh overshoots the visible viewport on
    // mobile browsers with a retractable URL bar.
    expect(layout).toHaveClass('h-dvh');
    expect(layout).not.toHaveClass('h-screen');
  });

  it('fills its parent instead of the viewport when fillParent is set', () => {
    // Used by screens rendered inside AppShell's full-height mode, where the
    // parent already resolves to the viewport minus shell chrome. Claiming a
    // hard 100vh there overflows the document and makes the page scroll.
    render(
      <MapScreenLayout
        sidePanel={<div>Panel</div>}
        map={<div>Map</div>}
        fillParent
      />,
    );
    const layout = screen.getByTestId('map-screen-layout');
    expect(layout).toHaveClass('h-full');
    expect(layout).not.toHaveClass('h-screen');
    expect(layout).not.toHaveClass('h-dvh');
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

// TASK-F05-2 (L-F05-04): per-screen panel-width key + a collapsible mobile sheet.
describe('MapScreenLayout — storageKey + mobile mode', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function mockMatchMedia(isMobile: boolean) {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query === '(max-width: 767px)' ? isMobile : !isMobile,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
  }

  it('reads the width from the appointments-map key by default (so /map is unchanged)', () => {
    // Distinct widths per key prove the default reads the /map key, not Live Day's.
    window.sessionStorage.setItem('appointments-map.filter-panel.width', '600');
    window.sessionStorage.setItem('live-day.panel.width', '400');
    render(<MapScreenLayout sidePanel={<div>P</div>} map={<div>M</div>} />);
    expect(screen.getByTestId('map-side-panel')).toHaveStyle({ width: '600px' });
    window.sessionStorage.clear();
  });

  it('reads the width from the given storageKey and never the default', () => {
    window.sessionStorage.setItem('appointments-map.filter-panel.width', '600');
    window.sessionStorage.setItem('live-day.panel.width', '400');
    render(
      <MapScreenLayout sidePanel={<div>P</div>} map={<div>M</div>} storageKey="live-day.panel.width" />,
    );
    expect(screen.getByTestId('map-side-panel')).toHaveStyle({ width: '400px' });
    window.sessionStorage.clear();
  });

  it('renders a collapsible bottom sheet below md with a Map / List toggle', async () => {
    mockMatchMedia(true);
    render(<MapScreenLayout sidePanel={<div>Panel body</div>} map={<div>M</div>} />);
    const panel = screen.getByTestId('map-side-panel');
    expect(panel).toHaveClass('max-h-[50dvh]');
    // No desktop resize handle in mobile mode.
    expect(document.querySelector('.cursor-col-resize')).toBeNull();
    const toggle = screen.getByTestId('map-list-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Panel body')).toBeInTheDocument();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Panel body')).not.toBeInTheDocument();
  });

  it('renders the floating card (no Map / List button) at desktop width', () => {
    mockMatchMedia(false);
    render(<MapScreenLayout sidePanel={<div>Panel body</div>} map={<div>M</div>} />);
    expect(screen.queryByTestId('map-list-toggle')).toBeNull();
    expect(screen.getByTestId('map-side-panel')).toHaveClass('fixed');
  });
});
