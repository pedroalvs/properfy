import { useState } from 'react';
import { Outlet, useMatches } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MobileDrawer } from './MobileDrawer';
import { OfflineBanner } from '@/components/feedback/OfflineBanner';

/**
 * Routes opt into full-height mode with `handle: { fullHeight: true }`.
 *
 * Normal pages grow freely (`min-h-screen`) and the document scrolls. Screens
 * that must occupy exactly the viewport — the maps — need the opposite: a hard
 * clamp, no page padding, and the shell chrome (offline banner, mobile top bar)
 * accounted for as flex siblings so the content gets only the leftover space.
 * Without this, a `100vh` child plus the shell's `py-6` overflows the document.
 *
 * The clamp uses `h-dvh`, not `h-screen`: on mobile browsers `100vh` is the
 * URL-bar-collapsed height, so it overshoots the visible viewport while the bar
 * is expanded and leaves a residual scroll. `dvh` tracks the live viewport.
 */
interface FullHeightHandle {
  fullHeight?: boolean;
}

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const matches = useMatches();
  const fullHeight = matches.some(
    (match) => (match.handle as FullHeightHandle | undefined)?.fullHeight === true,
  );

  return (
    <div
      className={`flex w-full max-w-full overflow-x-hidden bg-app-bg ${
        fullHeight ? 'h-dvh overflow-hidden' : 'min-h-screen'
      }`}
    >
      {/* Sidebar — hidden on mobile */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Mobile drawer */}
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Sidebar mobile onNavigate={() => setDrawerOpen(false)} />
      </MobileDrawer>

      <div className="min-w-0 flex-1 md:ml-sidebar">
        <main
          className={`min-w-0 max-w-full overflow-x-hidden bg-card-bg md:rounded-tl-[20px] md:shadow-[0_6px_12px_0_rgba(0,0,0,0.1)] ${
            fullHeight
              ? 'flex h-dvh flex-col overflow-hidden'
              : 'min-h-screen'
          }`}
          data-testid="main-content"
        >
          <OfflineBanner />
          {/* Mobile top bar with hamburger */}
          <div className="flex items-center gap-3 px-4 pt-2 pb-0 md:hidden">
            <button
              onClick={() => setDrawerOpen(true)}
              className="flex h-10 w-10 items-center justify-center rounded hover:bg-black/5"
              aria-label="Open navigation"
            >
              <i className="mdi mdi-menu text-xl text-secondary" aria-hidden="true" />
            </button>
            <span className="text-base font-bold text-secondary">Properfy</span>
          </div>
          <div
            className={`min-w-0 ${
              fullHeight ? 'min-h-0 flex-1' : 'px-4 py-2 md:px-8 md:py-6'
            }`}
            data-testid="main-content-inner"
          >
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
