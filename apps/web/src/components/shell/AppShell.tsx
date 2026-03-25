import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MobileDrawer } from './MobileDrawer';

export function AppShell() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Sidebar — hidden on mobile */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Mobile drawer */}
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Sidebar />
      </MobileDrawer>

      <div className="flex-1 bg-app-bg md:ml-sidebar">
        <main
          className="min-h-screen bg-card-bg md:rounded-tl-[20px] md:shadow-[0_6px_12px_0_rgba(0,0,0,0.1)]"
          data-testid="main-content"
        >
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
          <div className="px-4 py-2 md:px-8 md:py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
