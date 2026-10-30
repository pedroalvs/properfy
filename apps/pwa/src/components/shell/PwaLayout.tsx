import { Outlet, useMatches } from 'react-router-dom';
import { cn } from '@properfy/frontend-standards';
import { BottomNavBar } from './BottomNavBar';
import { OfflineBanner } from '@/components/feedback/OfflineBanner';
import { useAppStateHeartbeat } from '@/app/useAppStateHeartbeat';

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

  // Report installed-app adoption (throttled to once per 6h per device). PwaLayout
  // renders only behind the inspector auth guards, so the beat is always authenticated.
  useAppStateHeartbeat();

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
