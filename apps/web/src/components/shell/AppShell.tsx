import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function AppShell() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main
        className="ml-sidebar flex-1 bg-app-bg px-page-x py-page-y"
        data-testid="main-content"
      >
        <Outlet />
      </main>
    </div>
  );
}
