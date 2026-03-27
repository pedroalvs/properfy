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
        className={`overflow-y-auto border-b border-gray-200 bg-card-bg transition-all duration-300 md:flex-shrink-0 md:border-b-0 md:border-r ${
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
