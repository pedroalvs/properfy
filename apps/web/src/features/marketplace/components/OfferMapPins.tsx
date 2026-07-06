import { MapMarker } from '@/components/map/MapMarker';
import type { MarketplaceAppointment } from '../types';

interface OfferMapPinsProps {
  appointments: MarketplaceAppointment[];
  selectedId: string | null;
  onPinClick: (appointmentId: string) => void;
}

export function OfferMapPins({ appointments, selectedId, onPinClick }: OfferMapPinsProps) {
  return (
    <div data-testid="offer-map-pins">
      {appointments.map((apt) => (
        <MapMarker
          key={apt.id}
          longitude={apt.longitude}
          latitude={apt.latitude}
          label={apt.code}
          active={apt.id === selectedId}
          onClick={() => onPinClick(apt.id)}
        />
      ))}
    </div>
  );
}
