import type { AppointmentMapItem } from '../hooks/useAppointmentMapData';

const MAX_APPOINTMENTS = 30;

interface MapSelectionPanelProps {
  selectedAppointments: AppointmentMapItem[];
  onClearSelection: () => void;
  onCreateGroup: () => void;
}

export function MapSelectionPanel({
  selectedAppointments,
  onClearSelection,
  onCreateGroup,
}: MapSelectionPanelProps) {
  const count = selectedAppointments.length;
  const exceedsMax = count > MAX_APPOINTMENTS;

  if (count === 0) return null;

  return (
    <div
      className="fixed bottom-0 left-[75px] right-0 z-40 border-t border-border-subtle bg-card-bg px-6 py-3 shadow-lg"
      data-testid="map-selection-panel"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`text-sm font-semibold ${exceedsMax ? 'text-error' : 'text-text-primary'}`}>
            {count} appointment{count !== 1 ? 's' : ''} selected
          </span>
          {exceedsMax && (
            <span className="text-xs text-error">
              Maximum {MAX_APPOINTMENTS} appointments per group. Please reduce your selection.
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClearSelection}
            className="text-sm text-text-secondary hover:text-text-primary"
          >
            Clear selection
          </button>
          <button
            type="button"
            onClick={onCreateGroup}
            disabled={exceedsMax || count === 0}
            className="inline-flex h-9 items-center gap-2 rounded bg-real-estate px-4 text-sm font-semibold text-white hover:brightness-95 active:brightness-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <i className="mdi mdi-group text-base" />
            Create Group ({count})
          </button>
        </div>
      </div>

      {count > 0 && count <= 10 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {selectedAppointments.map((apt) => (
            <span
              key={apt.id}
              className="inline-block rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-text-secondary"
            >
              {apt.code}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
