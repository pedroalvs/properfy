import { cn } from '@properfy/frontend-standards';
import type { RewardAwardStatus } from '@properfy/shared';
import { rewardChipLabel, rewardChipTone } from '../lib/challenge-copy';

const TONE_CLASS: Record<ReturnType<typeof rewardChipTone>, string> = {
  default: 'bg-muted text-muted-foreground',
  good: 'bg-success/15 text-success',
  warning: 'bg-warning/15 text-warning',
  danger: 'bg-destructive/15 text-destructive',
};

/**
 * The inspector-facing reward status chip (DL14). For a voided reward it also shows
 * the note written for the inspector, or a neutral fallback — never the internal reason.
 */
export function RewardStatusChip({ status, inspectorNote }: { status: RewardAwardStatus; inspectorNote: string | null }) {
  return (
    <div className="flex flex-col items-end gap-1">
      <span className={cn('rounded-full px-2 py-0.5 text-xs font-semibold', TONE_CLASS[rewardChipTone(status)])}>
        {rewardChipLabel(status)}
      </span>
      {status === 'VOID' && (
        <span className="text-xs text-muted-foreground">
          {inspectorNote ?? 'Contact the Properfy team for details.'}
        </span>
      )}
    </div>
  );
}
