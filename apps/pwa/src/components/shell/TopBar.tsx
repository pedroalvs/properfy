import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { cn } from '@properfy/frontend-standards';
import { useIsOnline } from '@/hooks/useIsOnline';
import { useQueuedActionCount } from '@/features/execution/hooks/useQueuedActionCount';

interface TopBarProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  backTo?: string;
}

export function TopBar({ title, subtitle, showBack = false, backTo = '/schedule' }: TopBarProps) {
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

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background px-page-x py-3">
      <div className="flex min-h-[52px] items-center gap-3">
      {showBack && (
        <button
          onClick={handleBack}
          className="flex min-h-touch min-w-touch items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-primary/5"
          aria-label="Go back"
          data-testid="back-button"
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="truncate text-xl font-extrabold tracking-tight text-foreground">{title}</h1>
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
        <div className="flex items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
          <span
            className={cn('h-2.5 w-2.5 flex-shrink-0 rounded-full', isOnline ? 'bg-success' : 'bg-destructive')}
            title={isOnline ? 'Online' : 'Offline'}
            data-testid="connection-indicator"
          />
          <span>{isOnline ? 'Online' : 'Offline'}</span>
        </div>
      </div>
      </div>
    </header>
  );
}
