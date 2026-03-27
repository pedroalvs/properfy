import { useState } from 'react';
import { useSessions, type Session } from '../hooks/useSessions';
import { Button } from '@/components/ui/Button';

function formatDevice(userAgent: string | null): string {
  if (!userAgent) return 'Unknown device';
  if (/Mobile|Android|iPhone/i.test(userAgent)) return 'Mobile';
  if (/iPad|Tablet/i.test(userAgent)) return 'Tablet';
  return 'Desktop';
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '\u2014';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'short', timeStyle: 'short' }).format(d);
}

export function SessionsSection() {
  const { sessions, isLoading, isError, refetch, revokeSession, revokingId } = useSessions();
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState('');

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="flex w-full items-center justify-between rounded-2xl bg-white p-4 text-left shadow-sm"
      >
        <div className="flex items-center gap-3">
          <i className="mdi mdi-devices text-xl text-text-secondary" />
          <div>
            <span className="text-sm font-medium text-text-primary">Active Sessions</span>
            {!isLoading && <span className="ml-2 text-xs text-text-muted">({sessions.length})</span>}
          </div>
        </div>
        <i className="mdi mdi-chevron-right text-xl text-text-muted" />
      </button>
    );
  }

  const handleRevoke = async (id: string) => {
    setError('');
    try {
      await revokeSession(id);
    } catch (err: any) {
      setError(err.message ?? 'Failed to revoke session');
    }
  };

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <i className="mdi mdi-devices text-xl text-text-secondary" />
          <span className="text-sm font-semibold text-text-primary">Active Sessions</span>
        </div>
        <button type="button" onClick={() => setExpanded(false)} className="text-sm text-text-muted">Close</button>
      </div>

      {error && <p className="mt-3 rounded-xl bg-error/10 px-3 py-2 text-xs text-error">{error}</p>}

      <div className="mt-3 space-y-2">
        {isLoading && <p className="py-4 text-center text-xs text-text-muted">Loading sessions...</p>}
        {isError && (
          <div className="py-4 text-center">
            <p className="text-xs text-error">Failed to load sessions</p>
            <button type="button" onClick={() => refetch()} className="mt-1 text-xs font-semibold text-primary">Retry</button>
          </div>
        )}
        {!isLoading && !isError && sessions.map((s: Session) => (
          <div key={s.id} className="flex items-center justify-between rounded-xl bg-app-bg/60 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text-primary">{formatDevice(s.userAgent)}</span>
                {s.isCurrent && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">Current</span>}
              </div>
              <p className="truncate text-xs text-text-muted">{s.ipAddress ?? 'Unknown IP'} \u00b7 Started {formatTime(s.createdAt)}</p>
            </div>
            {!s.isCurrent && (
              <Button
                variant="secondary"
                onClick={() => handleRevoke(s.id)}
                loading={revokingId === s.id}
                className="!ml-2 !rounded-lg !px-2 !py-1 !text-xs !text-error"
              >
                Revoke
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
