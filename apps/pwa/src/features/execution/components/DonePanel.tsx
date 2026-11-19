import { useNavigate } from 'react-router-dom';
import { CheckCircle2, CloudUpload } from 'lucide-react';
import { cn } from '@properfy/frontend-standards';
import type { DayPlanStop } from '@properfy/shared';
import { Button } from '@/components/ui/Button';
import { StopCard } from '@/features/day-plan/components/StopCard';

interface DonePanelProps {
  pendingSync?: boolean;
  onBack?: () => void;
  /**
   * The next stop in today's route, after the one just completed (B3). When set, the
   * panel surfaces it so the inspector flows straight into the next job (open detail /
   * Navigate) instead of going back to the list.
   */
  nextStop?: DayPlanStop | null;
  /** True when the completed job was the last active stop of the day. */
  allDone?: boolean;
}

export function DonePanel({
  pendingSync = false,
  onBack,
  nextStop = null,
  allDone = false,
}: DonePanelProps) {
  const navigate = useNavigate();
  const Icon = pendingSync ? CloudUpload : CheckCircle2;
  const hasNext = nextStop != null;

  return (
    <div className="flex flex-col items-center px-page-x py-16 text-center" data-testid="done-panel">
      <div
        className={cn(
          'flex h-20 w-20 items-center justify-center rounded-full',
          pendingSync ? 'bg-primary/10 text-primary' : 'bg-success/10 text-success',
        )}
      >
        <Icon className="h-10 w-10" aria-hidden="true" />
      </div>
      <h2 className="mt-4 text-lg font-extrabold tracking-tight text-foreground">
        {pendingSync ? 'Inspection Saved Locally' : 'Inspection Complete'}
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">
        {pendingSync
          ? 'Your inspection will sync automatically when you are back online. You can safely return to your schedule.'
          : 'The inspection has been submitted successfully.'}
      </p>

      {hasNext && (
        <div className="mt-8 w-full max-w-md text-left" data-testid="next-inspection">
          <p className="mb-2 text-sm font-semibold text-foreground">Up next on your route</p>
          <StopCard variant="next" stop={nextStop} />
        </div>
      )}

      {!hasNext && allDone && (
        <p className="mt-6 text-sm font-semibold text-success" data-testid="all-done-today">
          All done for today. Great work!
        </p>
      )}

      <div className="mt-6">
        <Button
          variant={hasNext ? 'secondary' : 'primary'}
          onClick={() => {
            onBack?.();
            navigate('/schedule');
          }}
          data-testid="back-to-schedule"
        >
          Back to Schedule
        </Button>
      </div>
    </div>
  );
}
