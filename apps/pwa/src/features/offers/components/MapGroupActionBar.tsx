import { Button } from '@/components/ui/Button';

interface MapGroupActionBarProps {
  /** Human-friendly group code (numeric string) — never a raw UUID. */
  groupCode: string;
  appointmentCount: number;
  /** True while the group detail (appointment pins) is still loading. */
  loading: boolean;
  onReset: () => void;
  onAccept: () => void;
}

export function MapGroupActionBar({
  groupCode,
  appointmentCount,
  loading,
  onReset,
  onAccept,
}: MapGroupActionBarProps) {
  return (
    <div
      data-testid="map-group-action-bar"
      className="flex items-center justify-between gap-3 rounded-2xl border border-primary/15 bg-white px-4 py-3 shadow-sm"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-secondary">Group {groupCode}</p>
        <p className="truncate text-xs text-text-secondary">
          {loading
            ? 'Loading inspections…'
            : `${appointmentCount} ${appointmentCount === 1 ? 'inspection' : 'inspections'}`}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="outlined" data-testid="map-reset-btn" onClick={onReset}>
          Reset
        </Button>
        <Button
          variant="primary"
          data-testid="map-accept-group-btn"
          onClick={onAccept}
          disabled={loading}
        >
          Accept group
        </Button>
      </div>
    </div>
  );
}
