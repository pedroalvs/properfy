import { useEffect } from 'react';
import { Outlet, useMatches, useNavigate } from 'react-router-dom';
import { cn } from '@properfy/frontend-standards';
import { BottomNavBar } from './BottomNavBar';
import { OfflineBanner } from '@/components/feedback/OfflineBanner';
import { useAppStateHeartbeat } from '@/app/useAppStateHeartbeat';
import { useAuth } from '@/hooks/useAuth';
import { useBrowserPushDeps } from '@/features/push/hooks/useBrowserPushDeps';
import { usePushSubscriptionSync } from '@/features/push/hooks/usePushSubscriptionSync';
import { useNoticeOpenedFromPush } from '@/app/useNoticeOpenedFromPush';

/** A route opts into the wide (2-column) shell by exporting `handle: { wide: true }`. */
interface WideHandle {
  wide?: boolean;
}

export function PwaLayout() {
  // Screens that present a 2-column master-detail (Schedule, Profile, Marketplace) mark their
  // route `handle: { wide: true }` so the shell lifts the 640px single-column cap on tablet.
  // Every other screen keeps the validated phone-width column, centered. `md:` gates the wider
  // cap, so on phone (<768px) the cap is 640 either way and nothing changes.
  const matches = useMatches();
  const isWide = matches.some((match) => (match.handle as WideHandle | undefined)?.wide === true);
  const navigate = useNavigate();
  const { user } = useAuth();

  // Report installed-app adoption (throttled to once per 6h per device). PwaLayout
  // renders only behind the inspector auth guards, so the beat is always authenticated.
  useAppStateHeartbeat();

  // Keep this device's push subscription registered on every authenticated load
  // and after the service worker rotates it; mark a notice read when a push
  // opened a non-inbox target (?fromNotice=<id>).
  const pushDeps = useBrowserPushDeps();
  usePushSubscriptionSync(user?.id ?? null, pushDeps);
  useNoticeOpenedFromPush();

  // The service worker asks the app to navigate when a notification is clicked and
  // the open client cannot navigate itself (push-handlers resolveClickTarget).
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const container = navigator.serviceWorker;
    if (!container) return;
    const handler = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | undefined;
      if (data?.type === 'navigate' && typeof data.url === 'string') {
        navigate(data.url);
      }
    };
    container.addEventListener('message', handler);
    return () => container.removeEventListener('message', handler);
  }, [navigate]);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-background" data-testid="pwa-layout">
      <OfflineBanner />
      <main
        className={cn(
          'mx-auto flex w-full flex-1 pb-nav-clear',
          isWide ? 'max-w-screen-sm md:max-w-screen-lg' : 'max-w-screen-sm',
        )}
        data-wide={isWide ? 'true' : undefined}
      >
        <Outlet />
      </main>
      <BottomNavBar />
    </div>
  );
}
