import { type ReactNode } from 'react';
import { useResizableWidth } from '@/hooks/useResizableWidth';

interface MapScreenLayoutProps {
  sidePanel: ReactNode;
  map: ReactNode;
  /** Not used for width — width is managed internally via the resize handle. Kept for API compat. */
  sidePanelWidth?: string;
  sidePanelOpen?: boolean;
  /**
   * Fill the parent box (`h-full`) instead of the viewport (`h-screen`).
   *
   * Set this when the screen runs inside AppShell's full-height mode, where the
   * parent already resolves to the viewport minus the shell chrome. Claiming a
   * hard 100vh there stacks on top of that chrome and makes the page scroll.
   * Defaults to `false` — a parent with no resolved height would collapse an
   * `h-full` map to zero.
   */
  fillParent?: boolean;
}

/**
 * 026 §FR-570 — filter panel is a floating card (position: fixed left-4 top-4)
 * so the map fills the full viewport at all times. The panel is a glass-style
 * overlay that can be resized via its right-edge drag handle.
 *
 * Cycle 4 change: removed the dark semitransparent backdrop that was blocking
 * map readability; the panel's own bg-card-bg/95 backdrop-blur-sm provides
 * enough visual separation without hiding the map behind it.
 */
export function MapScreenLayout({
  sidePanel,
  map,
  sidePanelOpen = true,
  fillParent = false,
}: MapScreenLayoutProps) {
  const { widthPx, isDragging, onHandleMouseDown } = useResizableWidth({
    initialPx: 420,
    minPx: 360,
    maxPx: 720,
    storageKey: 'appointments-map.filter-panel.width',
    direction: 'right',
  });

  return (
    <div
      className={fillParent ? 'relative h-full' : 'relative h-dvh'}
      data-testid="map-screen-layout"
    >
      {/* Map always fills the full viewport */}
      <div
        className="h-full w-full"
        data-testid="map-area"
      >
        {map}
      </div>

      {/* Floating filter panel — fixed position so it overlays the map without displacing it */}
      {sidePanelOpen && (
        <div
          className={`fixed left-4 top-4 z-40 flex flex-col overflow-hidden rounded-lg border border-border-subtle bg-card-bg/85 shadow-xl backdrop-blur-sm md:left-[91px]${isDragging ? ' select-none' : ''}`}
          style={{ width: widthPx, maxHeight: 'calc(100dvh - 32px)' }}
          data-testid="map-side-panel"
        >
          {sidePanel}
          {/* Right-edge resize handle */}
          <div
            className="absolute right-0 top-0 hidden h-full w-1.5 cursor-col-resize items-center justify-center sm:flex"
            onMouseDown={onHandleMouseDown}
            aria-hidden="true"
          >
            <div className="h-8 w-0.5 rounded-full bg-border-subtle opacity-60" />
          </div>
        </div>
      )}
    </div>
  );
}
