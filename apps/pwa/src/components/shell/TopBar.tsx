import { ChevronLeft, RefreshCw } from 'lucide-react';
import { cn } from '@properfy/frontend-standards';
import { useGoBack } from '@/hooks/useGoBack';
import { useIsOnline } from '@/hooks/useIsOnline';
import { useQueuedActionCount } from '@/features/execution/hooks/useQueuedActionCount';
import { useWidePane } from './WidePaneContext';

interface TopBarProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  backTo?: string;
  /**
   * Hide the back button at the tablet breakpoint (≥md). Set on pages shown inside a
   * 2-column master-detail pane, where the master list is always visible so "back" is
   * redundant — selecting another item just swaps the pane. On phone the button stays.
   */
  backHideOnWide?: boolean;
  /**
   * Title scale. `lg` is the v3 primary-tab heading (Schedule/Offers); the default
   * is the smaller sub-page heading (detail/earnings). A prop so only primary tabs
   * opt into the larger title.
   */
  size?: 'default' | 'lg';
}

export function TopBar({
  title,
  subtitle,
  showBack = false,
  backTo = '/schedule',
  backHideOnWide = false,
  size = 'default',
}: TopBarProps) {
  const handleBack = useGoBack(backTo);
  const isOnline = useIsOnline();
  const queuedCount = useQueuedActionCount();
  // Inside a scroll-owning two-pane pane (fillHeight), pin the header to the pane top on tablet so
  // the title stays visible while the pane scrolls. Phone keeps the v3 non-sticky behaviour.
  const { stickyHeader } = useWidePane();

  // v3: by default the title is NOT a sticky bar — it scrolls away as the first element of the
  // content, with no header divider. The exception is a scroll-owning two-pane pane (`stickyHeader`),
  // where it pins to the pane top on tablet so the title stays visible while the pane scrolls.
  return (
    <header
      className={cn(
        'bg-background px-page-x py-3',
        // `bg-background` is opaque, so scrolled content passes cleanly under the pinned header.
        stickyHeader && 'md:sticky md:top-0 md:z-10',
      )}
    >
      <div className="flex min-h-[52px] items-center gap-3">
      {showBack && (
        // v3: a plain "‹" chevron, no circle/border. `-ml-2` pulls the glyph to the
        // page edge while the 44px min target (min-h/min-w-touch) stays intact.
        <button
          onClick={handleBack}
          className={cn(
            '-ml-2 flex min-h-touch min-w-touch items-center justify-center text-foreground transition-opacity active:opacity-60',
            backHideOnWide && 'md:hidden',
          )}
          aria-label="Go back"
          data-testid="back-button"
        >
          <ChevronLeft size={30} aria-hidden="true" />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <h1
          className={cn(
            'truncate font-extrabold text-foreground',
            // `.pf-h1`: 27px / 800 / -0.4px tracking for the primary-tab heading;
            // sub-pages keep the 20px `.pf-h2` scale with the default tight tracking.
            size === 'lg' ? 'text-[27px] tracking-[-0.4px]' : 'text-xl tracking-tight',
          )}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="truncate text-xs text-muted-foreground" data-testid="topbar-subtitle">
            {subtitle}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        {queuedCount > 0 && (
          <div
            className="flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2.5 py-1 text-[11px] font-semibold text-warning"
            data-testid="queue-badge"
          >
            <RefreshCw size={12} aria-hidden="true" />
            <span>{queuedCount} pending</span>
          </div>
        )}
        {/* v3 has no persistent Online pill — signal only when offline. The global
            OfflineBanner and the schedule's ScheduleOfflineBanner carry the offline
            wording; the TopBar keeps only a compact dot so the state is glanceable
            from any screen without a third copy of the "offline" text. */}
        {!isOnline && (
          <span
            className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-destructive"
            role="img"
            aria-label="Offline"
            title="Offline"
            data-testid="connection-indicator"
          />
        )}
      </div>
      </div>
    </header>
  );
}
