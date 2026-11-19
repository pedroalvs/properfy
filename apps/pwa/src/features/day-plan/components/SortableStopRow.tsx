import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { DayPlanStop } from '@properfy/shared';
import { StopCard } from './StopCard';
import { ReorderControls } from './ReorderControls';

interface SortableStopRowProps {
  stop: DayPlanStop;
  /** 1-based position in the full displayed order (locked prefix included). */
  position: number;
  etaOverride?: string;
  violationMessage?: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  reducedMotion: boolean;
  /** When frozen (a newer version arrived), reordering is blocked until Review. */
  disabled?: boolean;
}

/**
 * A reorderable stop row: a drag handle (pointer + keyboard via dnd-kit), the
 * shared `StopCard` row showing the local position and ETA, up/down arrows, and
 * a per-stop window-overrun warning. Only the handle carries `touch-action:none`
 * so the list still scrolls on touch.
 */
export function SortableStopRow({
  stop,
  position,
  etaOverride,
  violationMessage,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  reducedMotion,
  disabled = false,
}: SortableStopRowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: stop.appointmentId,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: reducedMotion ? undefined : transition,
    zIndex: isDragging ? 1 : undefined,
  } as const;

  return (
    <div ref={setNodeRef} style={style} data-testid={`reorder-row-${stop.appointmentId}`}>
      <div className="flex items-stretch gap-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          aria-label={`Drag to reorder stop ${position}`}
          disabled={disabled}
          className="min-h-touch min-w-touch flex shrink-0 touch-none items-center justify-center rounded-lg text-muted-foreground active:bg-muted disabled:opacity-30"
          {...attributes}
          {...listeners}
        >
          <GripVertical size={18} aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1">
          <StopCard stop={stop} variant="row" displayNumber={position} etaOverride={etaOverride} />
          {violationMessage && (
            <p className="mt-1 pl-10 text-xs font-medium text-warning" role="note">
              {violationMessage}
            </p>
          )}
        </div>
        <ReorderControls
          position={position}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
        />
      </div>
    </div>
  );
}
