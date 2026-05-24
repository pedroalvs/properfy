import type { ReactNode } from 'react';

interface MapScreenLayoutProps {
  sidePanel: ReactNode;
  map: ReactNode;
  sidePanelWidth?: string;
  sidePanelOpen?: boolean;
}

/**
 * 026 §FR-570 — side panel is an overlay; when closed it is FULLY hidden
 * (the panel root carries `display: none` via the `hidden` Tailwind class)
 * so the map underneath spans the entire viewport. Previous round shipped a
 * slide-out animation that kept the panel rendered with
 * `translate-x-full + opacity-100`, which the user smoke caught as "indo
 * para o lado e não desaparecendo" — the panel was still visible during /
 * after the transition. Hiding via `hidden` matches the operator's
 * expectation that the toggle button toggles VISIBILITY, not animation.
 *
 * When open on desktop the panel is `position: absolute` over the map so
 * the map's flex child stays full-width underneath. The top-left
 * `MapFilterToggleButton` re-opens it. Mobile keeps stacked flow because
 * vertical real estate is the limiting factor there.
 */
export function MapScreenLayout({
  sidePanel,
  map,
  sidePanelWidth = '400px',
  sidePanelOpen = true,
}: MapScreenLayoutProps) {
  return (
    <div
      className="relative flex h-screen flex-col gap-0 md:flex-row"
      data-testid="map-screen-layout"
    >
      {sidePanelOpen && (
        <>
          {/* Semitransparent backdrop visible on desktop behind the overlay panel. */}
          <div
            className="pointer-events-none hidden md:absolute md:inset-0 md:z-20 md:block md:bg-black/30 md:backdrop-blur-sm"
            aria-hidden="true"
          />
          <div
            className="flex max-h-[40vh] flex-col overflow-hidden border-gray-200 bg-card-bg md:absolute md:left-0 md:top-0 md:z-30 md:h-full md:max-h-full md:flex-shrink-0 md:border-r md:shadow-lg"
            style={{ width: sidePanelWidth, maxWidth: '100%' }}
            data-testid="map-side-panel"
          >
            {sidePanel}
          </div>
        </>
      )}

      <div
        className="min-h-[320px] flex-1 md:min-h-0 md:w-full"
        data-testid="map-area"
      >
        {map}
      </div>
    </div>
  );
}
