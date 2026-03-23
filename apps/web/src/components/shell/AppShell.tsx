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

      <main
        className="flex-1 bg-app-bg px-4 py-4 md:ml-sidebar md:px-page-x md:py-page-y"
        data-testid="main-content"
      >
        {/* Mobile top bar with hamburger */}
        <div className="mb-4 flex items-center gap-3 md:hidden">
          <button
            onClick={() => setDrawerOpen(true)}
            className="flex h-10 w-10 items-center justify-center rounded hover:bg-black/5"
            aria-label="Open navigation"
          >
            <i className="mdi mdi-menu text-xl text-secondary" aria-hidden="true" />
          </button>
          <span className="text-base font-bold text-secondary">Properfy</span>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
