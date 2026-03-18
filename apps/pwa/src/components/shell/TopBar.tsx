import { useNavigate } from 'react-router-dom';
import { useIsOnline } from '@/hooks/useIsOnline';

interface TopBarProps {
  title: string;
  subtitle?: string;
  showBack?: boolean;
}

export function TopBar({ title, subtitle, showBack = false }: TopBarProps) {
  const navigate = useNavigate();
  const isOnline = useIsOnline();

  return (
    <header className="flex min-h-[56px] items-center gap-2 bg-card-bg px-page-x shadow-sm">
      {showBack && (
        <button
          onClick={() => navigate(-1)}
          className="flex min-h-touch min-w-touch items-center justify-center rounded-full hover:bg-black/5"
          aria-label="Go back"
          data-testid="back-button"
        >
          <i className="mdi mdi-arrow-left text-xl text-text-primary" />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <h1 className="text-lg font-bold text-secondary truncate">{title}</h1>
        {subtitle && (
          <p className="text-xs text-text-muted truncate" data-testid="topbar-subtitle">
            {subtitle}
          </p>
        )}
      </div>
      <span
        className={`h-2.5 w-2.5 flex-shrink-0 rounded-full ${isOnline ? 'bg-success' : 'bg-error'}`}
        title={isOnline ? 'Online' : 'Offline'}
        data-testid="connection-indicator"
      />
    </header>
  );
}
