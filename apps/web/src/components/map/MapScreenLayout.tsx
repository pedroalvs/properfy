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
    <div className="flex h-[calc(100vh-var(--page-padding-y)*2)] gap-0" data-testid="map-screen-layout">
      {/* Side Panel */}
      <div
        className={`flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-card-bg transition-all duration-300 ${
          sidePanelOpen ? 'opacity-100' : 'w-0 overflow-hidden opacity-0'
        }`}
        style={{ width: sidePanelOpen ? sidePanelWidth : 0 }}
        data-testid="map-side-panel"
      >
        {sidePanel}
      </div>

      {/* Map Area */}
      <div className="flex-1" data-testid="map-area">
        {map}
      </div>
    </div>
  );
}
