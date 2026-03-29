import { useNavigate } from 'react-router-dom';
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
    <header className="sticky top-0 z-20 border-b border-border-subtle/70 bg-white/88 px-page-x py-3 backdrop-blur-md">
      <div className="flex min-h-[52px] items-center gap-3">
      {showBack && (
        <button
          onClick={handleBack}
          className="flex min-h-touch min-w-touch items-center justify-center rounded-full border border-border-subtle bg-app-bg/80 text-text-primary transition-colors hover:bg-black/5"
          aria-label="Go back"
          data-testid="back-button"
        >
          <i className="mdi mdi-arrow-left text-xl text-text-primary" />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="truncate text-lg font-bold tracking-tight text-secondary">{title}</h1>
        {subtitle && (
          <p className="truncate text-xs text-text-muted" data-testid="topbar-subtitle">
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
            <i className="mdi mdi-sync text-xs" aria-hidden="true" />
            <span>{queuedCount} pending</span>
          </div>
        )}
        <div className="flex items-center gap-2 rounded-full border border-border-subtle bg-app-bg/80 px-2.5 py-1 text-[11px] font-semibold text-text-secondary">
          <span
            className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${isOnline ? 'bg-success' : 'bg-error'}`}
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
