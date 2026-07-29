import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { getStatusStyle } from '@/lib/status-colors';
import { AppointmentBoardCard, type BoardCardAction } from './AppointmentBoardCard';
import type { BoardColumn } from '../hooks/useAppointmentBoard';
import type { Appointment } from '../types';

interface AppointmentBoardColumnProps {
  column: BoardColumn;
  selectedIds: string[];
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: (ids: string[], allSelected: boolean) => void;
  /** Builds the hover actions for one card (RBAC/status filtering lives in the page). */
  buildCardActions?: (appointment: Appointment) => BoardCardAction[];
  /** True when any filter is active, so the empty state can say why it is empty. */
  hasActiveFilters: boolean;
}

export function AppointmentBoardColumn({
  column,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  buildCardActions,
  hasActiveFilters,
}: AppointmentBoardColumnProps) {
  const style = getStatusStyle(column.status);
  const loadedIds = column.items.map((item) => item.id);
  const allSelected = loadedIds.length > 0 && loadedIds.every((id) => selectedIds.includes(id));
  const selectable = !!onToggleSelect && !!onToggleSelectAll;

  return (
    <section
      className="flex h-full w-[280px] shrink-0 flex-col rounded bg-app-bg"
      aria-label={`${column.label} column`}
    >
      <header className="sticky top-0 z-10 rounded-t bg-app-bg px-3 pb-2 pt-3">
        <div className="flex items-center gap-2">
          {selectable && (
            <input
              type="checkbox"
              checked={allSelected}
              disabled={loadedIds.length === 0}
              onChange={() => onToggleSelectAll!(loadedIds, allSelected)}
              className="h-4 w-4 accent-primary disabled:opacity-40"
              aria-label={`Select all loaded ${column.label} appointments`}
            />
          )}
          <h2 className="text-sm font-bold uppercase tracking-wide text-text-secondary">
            {column.label}
          </h2>
          <span className="ml-auto rounded-full bg-card-bg px-2 py-0.5 text-xs font-bold text-text-secondary">
            {column.total}
          </span>
        </div>
        <div
          className="mt-2 h-1 rounded-full"
          style={{ backgroundColor: style.bg }}
          aria-hidden="true"
        />
      </header>

      {/* Each column owns its states: one failing column must not blank the board. */}
      <div className="flex-1 space-y-2 overflow-y-auto px-3 pb-3">
        {column.isLoading ? (
          <LoadingState rows={3} variant="card" />
        ) : column.isError ? (
          <ErrorState
            message={`Could not load ${column.label}`}
            detail={column.errorMessage ?? undefined}
            onRetry={column.refetch}
          />
        ) : column.items.length === 0 ? (
          <EmptyState
            title="Nothing here"
            description={
              hasActiveFilters
                ? 'No appointments match the current filters.'
                : `No ${column.label.toLowerCase()} appointments.`
            }
          />
        ) : (
          <>
            {column.items.map((appointment) => (
              <AppointmentBoardCard
                key={appointment.id}
                appointment={appointment}
                selected={selectedIds.includes(appointment.id)}
                onToggleSelect={onToggleSelect}
                actions={buildCardActions?.(appointment)}
              />
            ))}
            {column.hasMore && (
              <button
                type="button"
                onClick={column.loadMore}
                className="w-full rounded border border-border-subtle bg-card-bg py-2 text-sm font-semibold text-primary hover:bg-card-bg/70"
              >
                Load more ({column.items.length} of {column.total})
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
