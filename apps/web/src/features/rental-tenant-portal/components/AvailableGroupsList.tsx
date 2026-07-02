import type { AvailableGroup } from '@properfy/shared';

interface AvailableGroupsListProps {
  groups: AvailableGroup[];
  isLoading?: boolean;
  isError?: boolean;
  selectedSlotKey?: string;
  onSelect: (group: AvailableGroup) => void;
  onRetry?: () => void;
}

export function getAvailableGroupSlotKey(group: Pick<AvailableGroup, 'groupId' | 'scheduledDate' | 'timeSlotStart' | 'timeSlotEnd'>): string {
  return `${group.groupId}|${group.scheduledDate}|${group.timeSlotStart}|${group.timeSlotEnd}`;
}

function SkeletonRow() {
  return (
    <div className="animate-pulse rounded-lg border border-black/10 bg-white p-4">
      <div className="mb-2 h-4 w-1/3 rounded bg-gray-200" />
      <div className="h-3 w-1/2 rounded bg-gray-100" />
    </div>
  );
}

export function AvailableGroupsList({
  groups,
  isLoading,
  isError,
  selectedSlotKey,
  onSelect,
  onRetry,
}: AvailableGroupsListProps) {
  if (isLoading) {
    return (
      <div className="space-y-3" role="status" aria-label="Loading available times">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center">
        <p className="mb-3 text-sm text-red-700">Failed to load available times. Please try again.</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="rounded bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-text-muted">No available times nearby.</p>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const slotKey = getAvailableGroupSlotKey(group);
        const isSelected = slotKey === selectedSlotKey;
        return (
          <button
            key={slotKey}
            type="button"
            data-testid="group-row"
            onClick={() => onSelect(group)}
            className={[
              'w-full rounded-lg border bg-white p-4 text-left transition-colors hover:border-primary/50',
              isSelected
                ? 'border-primary ring ring-primary/30'
                : 'border-black/10',
            ].join(' ')}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-text-primary">{group.suburb}</span>
              <span className="text-sm text-text-muted">
                {group.confirmedCount}/{group.capacityMax} confirmed
              </span>
            </div>
            <div className="mt-1 flex items-center gap-3 text-sm text-text-secondary">
              <span>{group.timeSlotStart}-{group.timeSlotEnd}</span>
              <span>·</span>
              <span>{group.inspectorName}</span>
              <span>·</span>
              <span>{group.scheduledDate}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
