import { useEffect, useMemo, useRef, useState } from 'react';
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
import { moveDown as moveDownIds, moveItem, moveUp as moveUpIds } from '../lib/reorder-draft';
import {
  formatDelta,
  formatLocalEta,
  toViolationMessages,
  type ReorderPreviewView,
} from '../lib/reorder-preview';
import type { ReorderDraft } from '../hooks/useReorderDraft';

interface ReorderableStopListProps {
  plan: DayPlanResponse;
  draft: ReorderDraft;
  preview: ReorderPreviewView;
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
 * ETAs, legs and window warnings come from the server reorder preview (Plan B).
 * Because the finish/delta are no longer known synchronously, a move announces
 * its new position immediately and a second polite announcement adds the finish
 * once the preview resolves (FR-011).
 */
export function ReorderableStopList({ plan, draft, preview }: ReorderableStopListProps) {
  const [announcement, setAnnouncement] = useState('');
  const reducedMotion = prefersReducedMotion();
  /** Set on each move so the preview-resolved effect knows a move is awaiting its finish. */
  const pendingMoveRef = useRef<{ position: number; total: number } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const stopById = useMemo(() => new Map(plan.stops.map((s) => [s.appointmentId, s] as const)), [plan.stops]);
  const violationByKey = useMemo(() => {
    const messages = preview.status === 'READY' ? toViolationMessages(plan, draft.displayOrder, preview.violations) : [];
    return new Map(messages.map((m) => [m.appointmentId, m.message] as const));
  }, [plan, draft.displayOrder, preview.status, preview.violations]);

  const prefixCount = draft.lockedIds.length;

  // Announce the new position immediately; the finish is not known yet (async preview).
  const announceMove = (id: string, nextOrder: string[]) => {
    const position = prefixCount + nextOrder.indexOf(id) + 1;
    const total = prefixCount + nextOrder.length;
    pendingMoveRef.current = { position, total };
    setAnnouncement(`Stop moved to position ${position} of ${total}.`);
  };

  // Second step: when the preview settles after a move, append the finish/delta.
  useEffect(() => {
    const pending = pendingMoveRef.current;
    if (!pending || preview.status !== 'READY') return;
    const finish = formatLocalEta(preview.finishMs, plan.timezone);
    const delta = preview.deltaMin !== null ? `, ${formatDelta(preview.deltaMin)}` : '';
    pendingMoveRef.current = null;
    setAnnouncement(
      `Stop moved to position ${pending.position} of ${pending.total}.${finish ? ` Finish ${finish}` : ''}${delta}.`,
    );
  }, [preview.status, preview.finishMs, preview.deltaMin, plan.timezone]);

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
              const etaOverride = formatLocalEta(preview.etaByAppointmentId[id], stop.timezone);
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
