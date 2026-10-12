import { Outlet } from 'react-router-dom';
import { BottomNavBar } from './BottomNavBar';
import { OfflineBanner } from '@/components/feedback/OfflineBanner';

export function PwaLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-background" data-testid="pwa-layout">
      <OfflineBanner />
      <main className="mx-auto flex w-full max-w-screen-sm flex-1 pb-nav-clear">
        <Outlet />
      </main>
      <BottomNavBar />
    </div>
  );
}
