import { Outlet } from 'react-router-dom';
import { BottomNavBar } from './BottomNavBar';
import { OfflineBanner } from '@/components/feedback/OfflineBanner';

export function PwaLayout() {
  return (
    <div className="flex min-h-screen flex-col bg-app-bg" data-testid="pwa-layout">
      <OfflineBanner />
      <main className="flex-1 pb-16">
        <Outlet />
      </main>
      <BottomNavBar />
    </div>
  );
}
