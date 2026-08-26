import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';

interface InProgressPanelProps {
  startedAt: string | null;
  onFinish: () => void;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

export function InProgressPanel({ startedAt, onFinish }: InProgressPanelProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const startedMs = startedAt ? new Date(startedAt).getTime() : null;
  const elapsed = startedMs !== null ? formatElapsed(now - startedMs) : null;

  return (
    <div className="flex flex-col" data-testid="in-progress-panel">
      <div className="flex flex-col items-center gap-3 px-page-x py-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-card-bg">
          <i className="mdi mdi-clipboard-clock-outline text-3xl text-primary" aria-hidden="true" />
        </div>
        <h2 className="text-lg font-bold text-secondary">Inspection in progress</h2>
        <p className="text-sm text-text-muted">
          Carry out the inspection at the property, then finish to capture your location.
        </p>
        {elapsed && (
          <div className="mt-2" data-testid="elapsed-time">
            <p className="text-xs font-bold uppercase text-text-secondary">Elapsed</p>
            <p
              className="font-mono text-2xl font-bold tabular-nums text-text-primary"
              aria-live="polite"
            >
              {elapsed}
            </p>
          </div>
        )}
      </div>

      <div className="px-page-x pb-4">
        <Button
          variant="primary"
          onClick={onFinish}
          className="!w-full !min-h-[48px]"
          data-testid="proceed-to-finish-button"
        >
          Finish Inspection
        </Button>
      </div>
    </div>
  );
}
