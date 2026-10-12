import { useNavigate } from 'react-router-dom';
import { ChevronLeft, RefreshCw } from 'lucide-react';
import { cn } from '@properfy/frontend-standards';
import { useIsOnline } from '@/hooks/useIsOnline';
import { useQueuedActionCount } from '@/features/execution/hooks/useQueuedActionCount';

interface TopBarProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  backTo?: string;
  /**
   * Title scale. `lg` is the v3 primary-tab heading (Schedule/Offers); the default
   * is the smaller sub-page heading (detail/earnings). A prop so only primary tabs
   * opt into the larger title.
   */
  size?: 'default' | 'lg';
}

export function TopBar({ title, subtitle, showBack = false, backTo = '/schedule', size = 'default' }: TopBarProps) {
  const navigate = useNavigate();
  const isOnline = useIsOnline();
  const queuedCount = useQueuedActionCount();

  const handleBack = () => {
    const historyIndex = typeof window !== 'undefined'
      ? (window.history.state as { idx?: number } | null)?.idx ?? 0
      : 0;

    if (historyIndex > 0) {
      navigate(-1);
      return;
    }

    navigate(backTo, { replace: true });
  };

  // v3: the title is NOT a sticky bar — it scrolls away as the first element of the
  // content, with no header divider (hence no `sticky`/`border-b`).
  return (
    <header className="bg-background px-page-x py-3">
      <div className="flex min-h-[52px] items-center gap-3">
      {showBack && (
        // v3: a plain "‹" chevron, no circle/border. `-ml-2` pulls the glyph to the
        // page edge while the 44px min target (min-h/min-w-touch) stays intact.
        <button
          onClick={handleBack}
          className="-ml-2 flex min-h-touch min-w-touch items-center justify-center text-foreground transition-opacity active:opacity-60"
          aria-label="Go back"
          data-testid="back-button"
        >
          <ChevronLeft size={30} aria-hidden="true" />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <h1
          className={cn(
            'truncate font-extrabold tracking-tight text-foreground',
            size === 'lg' ? 'text-2xl' : 'text-xl',
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
            OfflineBanner (PwaLayout) remains the primary offline cue; this is a compact
            in-header echo so offline is obvious from any screen. */}
        {!isOnline && (
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
            <span
              className="h-2.5 w-2.5 flex-shrink-0 rounded-full bg-destructive"
              title="Offline"
              data-testid="connection-indicator"
            />
            <span>Offline</span>
          </div>
        )}
      </div>
      </div>
    </header>
  );
}
