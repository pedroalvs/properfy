import type { ReactNode } from 'react';

interface MapScreenLayoutProps {
  sidePanel: ReactNode;
  map: ReactNode;
  sidePanelWidth?: string;
  sidePanelOpen?: boolean;
}

export function MapScreenLayout({
  sidePanel,
  map,
  sidePanelWidth = '400px',
  sidePanelOpen = true,
}: MapScreenLayoutProps) {
  return (
    <div
      className="flex min-h-[calc(100vh-var(--page-padding-y)*2)] flex-col gap-0 md:h-[calc(100vh-var(--page-padding-y)*2)] md:flex-row"
      data-testid="map-screen-layout"
    >
      <div
        // Issue #4 (UX smoke — responsive): on mobile the layout stacks
        // (side panel above, map below). Without an explicit height cap
        // the panel takes its natural height — which, when the filter
        // panel is expanded and the result list is long, easily swallows
        // the whole viewport and squishes the map to its 320px min. Cap
        // the panel at 40vh on mobile so the map always has ≥60vh, while
        // letting `overflow-y-auto` scroll the panel internally. Desktop
        // keeps the original fixed-width sidebar via `md:max-h-full`.
        className={`overflow-y-auto border-b border-gray-200 bg-card-bg transition-all duration-300 max-h-[40vh] md:max-h-full md:flex-shrink-0 md:border-b-0 md:border-r ${
          sidePanelOpen ? 'opacity-100' : 'max-h-0 overflow-hidden opacity-0 md:w-0'
        }`}
        style={
          sidePanelOpen
            ? { width: sidePanelWidth, maxWidth: '100%' }
            : { width: 0, maxHeight: 0 }
        }
        data-testid="map-side-panel"
      >
        {sidePanel}
      </div>

      <div
        className="min-h-[320px] flex-1 md:min-h-0"
        data-testid="map-area"
      >
        {map}
      </div>
    </div>
  );
}
