import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

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
    <Card
      data-testid="map-group-action-bar"
      className="flex items-center justify-between gap-3 px-4 py-3"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-foreground">Group {groupCode}</p>
        <p className="truncate text-xs text-muted-foreground">
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
    </Card>
  );
}
