import { cn } from '@properfy/frontend-standards';

interface ProgressBarProps {
  progress: number;
  label?: string;
}

export function ProgressBar({ progress, label }: ProgressBarProps) {
  return (
    <div role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
      {label && <p className="mb-1 text-xs text-muted-foreground">{label}</p>}
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn('h-full rounded-full bg-primary transition-all duration-300')}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
