import { Outlet } from 'react-router-dom';
import { BottomNavBar } from './BottomNavBar';
import { OfflineBanner } from '@/components/feedback/OfflineBanner';

export function PwaLayout() {
  return (
    <div
      className="flex min-h-screen flex-col bg-[radial-gradient(circle_at_top,_rgba(30,64,175,0.08),_transparent_38%),linear-gradient(180deg,_#f8fafc_0%,_#eef2ff_100%)]"
      data-testid="pwa-layout"
    >
      <OfflineBanner />
      <main className="mx-auto flex w-full max-w-screen-sm flex-1 pb-20">
        <Outlet />
      </main>
      <BottomNavBar />
    </div>
  );
}
