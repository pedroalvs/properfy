import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@properfy/frontend-standards';
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
  /**
   * TASK-F05-2 (L-F05-04) — sessionStorage key for the desktop panel width.
   * Defaults to the appointments-map key so `/map` keeps its saved width; Live
   * Day passes `'live-day.panel.width'` so the two screens never share a width.
   */
  storageKey?: string;
}

const DEFAULT_WIDTH_STORAGE_KEY = 'appointments-map.filter-panel.width';
const MOBILE_MEDIA_QUERY = '(max-width: 767px)';

/** Below `md`, the floating card becomes a bottom sheet that can collapse to its header. */
function isMobileViewport() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
}

/**
 * 026 §FR-570 — on desktop the filter panel is a floating, resizable card so the
 * map fills the viewport. TASK-F05-2 (L-F05-04) adds a collapsible mobile mode:
 * below `md` the panel becomes a bottom sheet (full width with a 16px gutter,
 * `max-h-[50dvh]`, internal scroll) with a "Map / List" button that collapses it
 * to its header so the operator can see the map. `/map` and Live Day share this.
 */
export function MapScreenLayout({
  sidePanel,
  map,
  sidePanelOpen = true,
  fillParent = false,
  storageKey = DEFAULT_WIDTH_STORAGE_KEY,
}: MapScreenLayoutProps) {
  const { widthPx, isDragging, onHandleMouseDown } = useResizableWidth({
    initialPx: 420,
    minPx: 360,
    maxPx: 720,
    storageKey,
    direction: 'right',
  });

  const [isMobile, setIsMobile] = useState(isMobileViewport);
  // Mobile bottom sheet starts expanded; "Map / List" collapses it to the header.
  const [mobileExpanded, setMobileExpanded] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(MOBILE_MEDIA_QUERY);
    const sync = (matches: boolean) => setIsMobile(matches);
    sync(mq.matches);
    if (typeof mq.addEventListener === 'function') {
      const listener = (e: MediaQueryListEvent) => sync(e.matches);
      mq.addEventListener('change', listener);
      return () => mq.removeEventListener('change', listener);
    }
    const legacy = (e: MediaQueryListEvent) => sync(e.matches);
    mq.addListener(legacy);
    return () => mq.removeListener(legacy);
  }, []);

  return (
    <div
      className={fillParent ? 'relative h-full' : 'relative h-dvh'}
      data-testid="map-screen-layout"
    >
      {/* Map always fills the full viewport */}
      <div className="h-full w-full" data-testid="map-area">
        {map}
      </div>

      {sidePanelOpen && isMobile && (
        <div
          className="fixed inset-x-4 bottom-4 z-40 flex max-h-[50dvh] flex-col overflow-hidden rounded-lg border border-border-subtle bg-card-bg/95 shadow-xl backdrop-blur-sm"
          data-testid="map-side-panel"
        >
          <button
            type="button"
            onClick={() => setMobileExpanded((v) => !v)}
            aria-expanded={mobileExpanded}
            className="flex min-h-[44px] items-center justify-center gap-2 border-b border-border-subtle px-4 py-2 text-sm font-semibold text-text-primary"
            data-testid="map-list-toggle"
          >
            <i className="mdi mdi-map" aria-hidden="true" />
            Map / List
          </button>
          {mobileExpanded && <div className="flex-1 overflow-y-auto">{sidePanel}</div>}
        </div>
      )}

      {/* Desktop: floating filter panel — fixed so it overlays the map without displacing it */}
      {sidePanelOpen && !isMobile && (
        <div
          className={cn(
            'fixed left-4 top-4 z-40 flex flex-col overflow-hidden rounded-lg border border-border-subtle bg-card-bg/85 shadow-xl backdrop-blur-sm md:left-[91px]',
            isDragging && 'select-none',
          )}
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
