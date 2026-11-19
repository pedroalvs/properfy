import { ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@properfy/frontend-standards';

interface ReorderControlsProps {
  /** 1-based stop position, used only in the labels. */
  position: number;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

const BUTTON = 'min-h-touch min-w-touch inline-flex items-center justify-center rounded-lg text-foreground active:bg-muted disabled:opacity-30';

/** Up/down arrows — the keyboard/non-pointer path for reordering a stop. */
export function ReorderControls({ position, canMoveUp, canMoveDown, onMoveUp, onMoveDown }: ReorderControlsProps) {
  return (
    <div className="flex shrink-0 flex-col">
      <button
        type="button"
        aria-label={`Move stop ${position} up`}
        disabled={!canMoveUp}
        onClick={onMoveUp}
        className={cn(BUTTON, 'h-6')}
      >
        <ChevronUp size={18} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={`Move stop ${position} down`}
        disabled={!canMoveDown}
        onClick={onMoveDown}
        className={cn(BUTTON, 'h-6')}
      >
        <ChevronDown size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
