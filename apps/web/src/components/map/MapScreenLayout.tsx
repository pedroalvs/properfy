import type { ReactNode } from 'react';

interface MapScreenLayoutProps {
  sidePanel: ReactNode;
  map: ReactNode;
  sidePanelWidth?: string;
  sidePanelOpen?: boolean;
}

/**
 * 026 §FR-570 — side panel collapse is now an OVERLAY, not push.
 *
 * Previous (025) collapse used `max-h-0 overflow-hidden md:w-0` which
 * shrank the panel to zero width while keeping it in the flex flow, so
 * the map expanded to fill — push-style. 026 wants the side panel to
 * SLIDE OUT over the map (overlay) so the map stays full-width
 * underneath and the toggle button can sit on top. The desktop path
 * uses `absolute + translateX(-100%)` for the closed state; mobile
 * stacking remains push because the constraint is vertical space, not
 * a movable overlay.
 *
 * Pointer-events: when closed the panel is `pointer-events: none` so
 * clicks pass through to the map underneath (lasso, marker clicks).
 */
export function MapScreenLayout({
  sidePanel,
  map,
  sidePanelWidth = '400px',
  sidePanelOpen = true,
}: MapScreenLayoutProps) {
  return (
    <div
      className="relative flex min-h-[calc(100vh-var(--page-padding-y)*2)] flex-col gap-0 md:h-[calc(100vh-var(--page-padding-y)*2)] md:flex-row"
      data-testid="map-screen-layout"
    >
      <div
        // Mobile: stacks naturally above the map; max-h:40vh / 0 collapse.
        // Desktop (md+): absolute overlay over the map; translateX(-100%)
        // when closed so the map remains full-width underneath. The
        // toggle button (MapFilterToggleButton) sits at top-left of the
        // map area and re-opens the panel.
        className={`overflow-y-auto border-gray-200 bg-card-bg transition-all duration-300 max-h-[40vh] md:absolute md:left-0 md:top-0 md:z-30 md:h-full md:max-h-full md:flex-shrink-0 md:border-r md:shadow-lg ${
          sidePanelOpen
            ? 'pointer-events-auto opacity-100 md:translate-x-0'
            : 'pointer-events-none max-h-0 overflow-hidden opacity-0 md:max-h-full md:-translate-x-full md:opacity-100'
        }`}
        style={
          sidePanelOpen
            ? { width: sidePanelWidth, maxWidth: '100%' }
            : undefined
        }
        data-testid="map-side-panel"
        aria-hidden={!sidePanelOpen}
      >
        {sidePanel}
      </div>

      <div
        className="min-h-[320px] flex-1 md:min-h-0 md:w-full"
        data-testid="map-area"
      >
        {map}
      </div>
    </div>
  );
}
