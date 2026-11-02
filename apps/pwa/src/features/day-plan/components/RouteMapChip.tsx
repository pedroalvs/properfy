import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import type { RoutePin } from '../hooks/useRoutePins';

interface RouteMapChipProps {
  pin: RoutePin;
  onClose: () => void;
}

/** The info chip shown when a route pin is tapped: stop number, address, window, and a link to the detail. */
export function RouteMapChip({ pin, onClose }: RouteMapChipProps) {
  return (
    <div
      data-testid="route-map-chip"
      className="absolute inset-x-3 bottom-3 flex items-start justify-between gap-2 rounded-2xl bg-card/95 px-4 py-3 shadow-lg backdrop-blur-sm"
    >
      <div className="min-w-0">
        <p className="text-sm font-bold text-foreground">{pin.chip.title}</p>
        <p className="truncate text-xs text-muted-foreground">{pin.chip.address}</p>
        {pin.chip.window && <p className="mt-0.5 text-xs text-muted-foreground">Window {pin.chip.window}</p>}
        <Link
          to={pin.chip.detailHref}
          className="mt-1 inline-block text-xs font-semibold text-primary active:underline"
        >
          Open details
        </Link>
      </div>
      <button
        data-testid="route-map-chip-close"
        aria-label="Close stop info"
        onClick={onClose}
        className="min-h-touch min-w-touch -mr-2 -mt-1 inline-flex items-center justify-center rounded-full text-muted-foreground active:bg-muted"
      >
        <X size={18} aria-hidden="true" />
      </button>
    </div>
  );
}
