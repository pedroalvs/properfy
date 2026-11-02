import { useMemo, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { DayPlanResponse } from '@properfy/shared';
import { StopCard } from './StopCard';
import { SortableStopRow } from './SortableStopRow';
import {
  evaluateDraft,
  formatDelta,
  formatLocalEta,
  moveDown as moveDownIds,
  moveItem,
  moveUp as moveUpIds,
  toViolationMessages,
} from '../lib/reorder-draft';
import type { ReorderDraft } from '../hooks/useReorderDraft';

interface ReorderableStopListProps {
  plan: DayPlanResponse;
  draft: ReorderDraft;
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

const SR_INSTRUCTIONS =
  'To pick up a stop, press space or enter. Use the arrow keys to move it. Press space or enter again to drop it, or escape to cancel.';

/**
 * The reorderable stop list: a fixed prefix of started/done stops, then the
 * not-started stops with a drag handle (pointer + keyboard) and up/down arrows.
 * ETAs, legs and window warnings come from the local draft evaluation. A polite
 * live region announces each move's new position and finish.
 */
export function ReorderableStopList({ plan, draft }: ReorderableStopListProps) {
  const [announcement, setAnnouncement] = useState('');
  const reducedMotion = prefersReducedMotion();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const stopById = useMemo(() => new Map(plan.stops.map((s) => [s.appointmentId, s] as const)), [plan.stops]);
  const violationByKey = useMemo(() => {
    const messages = draft.evaluation
      ? toViolationMessages(plan, draft.displayOrder, draft.evaluation.violations)
      : [];
    return new Map(messages.map((m) => [m.key, m.message] as const));
  }, [plan, draft.displayOrder, draft.evaluation]);

  const prefixCount = draft.lockedIds.length;

  // Announce from the PREDICTED next order — `draft.order` only updates on the
  // next render, so reading it here would be one move behind.
  const announceMove = (id: string, nextOrder: string[]) => {
    const position = prefixCount + nextOrder.indexOf(id) + 1;
    const total = prefixCount + nextOrder.length;
    const evaluation = evaluateDraft(plan, nextOrder, new Date());
    const finish = evaluation ? formatLocalEta(evaluation.finishS ?? undefined, plan.timezone) : '';
    const delta = evaluation ? `, ${formatDelta(evaluation.deltaFinishMin)}` : '';
    setAnnouncement(`Stop moved to position ${position} of ${total}.${finish ? ` Finish ${finish}` : ''}${delta}.`);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (draft.frozen) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = draft.order.indexOf(String(active.id));
    const to = draft.order.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    draft.moveTo(from, to);
    announceMove(String(active.id), moveItem(draft.order, from, to));
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">Drag or use the arrows to reorder. Times update as you go.</p>

      {/* Fixed prefix: started / done stops are not reorderable (DB11). */}
      {draft.lockedIds.map((id, index) => {
        const stop = stopById.get(id);
        if (!stop) return null;
        return <StopCard key={id} stop={stop} variant="row" displayNumber={index + 1} />;
      })}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={handleDragEnd}
        accessibility={{
          screenReaderInstructions: { draggable: SR_INSTRUCTIONS },
          announcements: {
            onDragStart: ({ active }) => `Picked up stop ${draft.order.indexOf(String(active.id)) + 1}.`,
            onDragOver: ({ active, over }) =>
              over ? `Stop ${draft.order.indexOf(String(active.id)) + 1} was moved over position ${draft.order.indexOf(String(over.id)) + 1}.` : '',
            onDragEnd: ({ active, over }) =>
              over
                ? `Stop ${draft.order.indexOf(String(active.id)) + 1} was dropped at position ${draft.order.indexOf(String(over.id)) + 1}.`
                : `Stop ${draft.order.indexOf(String(active.id)) + 1} was dropped.`,
            onDragCancel: ({ active }) => `Reordering cancelled. Stop ${draft.order.indexOf(String(active.id)) + 1} returned.`,
          },
        }}
      >
        <SortableContext items={draft.order} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {draft.order.map((id, index) => {
              const stop = stopById.get(id);
              if (!stop) return null;
              const position = prefixCount + index + 1;
              const etaOverride = formatLocalEta(draft.evaluation?.serviceStartByKey[id], stop.timezone);
              const onMoveUp = () => {
                if (draft.frozen) return;
                draft.moveUp(id);
                announceMove(id, moveUpIds(draft.order, id));
              };
              const onMoveDown = () => {
                if (draft.frozen) return;
                draft.moveDown(id);
                announceMove(id, moveDownIds(draft.order, id));
              };
              return (
                <SortableStopRow
                  key={id}
                  stop={stop}
                  position={position}
                  etaOverride={etaOverride || undefined}
                  violationMessage={violationByKey.get(id)}
                  canMoveUp={index > 0 && !draft.frozen}
                  canMoveDown={index < draft.order.length - 1 && !draft.frozen}
                  onMoveUp={onMoveUp}
                  onMoveDown={onMoveDown}
                  reducedMotion={reducedMotion}
                  disabled={draft.frozen}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>

      <p className="sr-only" role="status" aria-live="polite" data-testid="reorder-announcement">
        {announcement}
      </p>
    </div>
  );
}
