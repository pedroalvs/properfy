import { PriorityMode } from '@properfy/shared';
import { MapMarker } from '@/components/map/MapMarker';
import type { MarketplaceAppointment } from '../types';

interface OfferMapPinsProps {
  appointments: MarketplaceAppointment[];
  priorityMode: string;
  selectedId: string | null;
  onPinClick: (appointmentId: string) => void;
}

const PIN_COLORS: Record<string, string> = {
  [PriorityMode.STANDARD]: '#2196F3',
  [PriorityMode.PRIORITY_24H]: '#FF9800',
};

export function OfferMapPins({ appointments, priorityMode, selectedId, onPinClick }: OfferMapPinsProps) {
  const color = PIN_COLORS[priorityMode] ?? PIN_COLORS[PriorityMode.STANDARD];

  return (
    <div data-testid="offer-map-pins">
      {appointments.map((apt) => (
        <MapMarker
          key={apt.id}
          longitude={apt.longitude}
          latitude={apt.latitude}
          color={color}
          label={apt.code}
          active={apt.id === selectedId}
          onClick={() => onPinClick(apt.id)}
        />
      ))}
    </div>
  );
}
