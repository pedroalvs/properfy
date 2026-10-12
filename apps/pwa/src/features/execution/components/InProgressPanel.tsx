import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

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

function formatStartTime(startedAt: string): string {
  return new Date(startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
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
      <div className="px-page-x py-8">
        <Card className="flex flex-col items-center gap-3 py-8 text-center">
          {startedAt && (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" aria-hidden="true" />
              Started {formatStartTime(startedAt)}
            </p>
          )}

          {elapsed && (
            <div data-testid="elapsed-time">
              <p
                className="font-mono text-4xl font-bold tabular-nums text-foreground"
                aria-live="polite"
              >
                {elapsed}
              </p>
            </div>
          )}

          <Badge tone="blue">Inspection running</Badge>
        </Card>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Finishing captures your location and time. There is no checklist or photo step.
        </p>
      </div>

      <div className="px-page-x pb-4">
        <Button
          variant="success"
          block
          onClick={onFinish}
          data-testid="proceed-to-finish-button"
        >
          Check out &amp; finish
        </Button>
      </div>
    </div>
  );
}
