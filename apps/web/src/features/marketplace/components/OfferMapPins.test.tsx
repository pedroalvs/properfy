import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OfferMapPins } from './OfferMapPins';
import type { MarketplaceAppointment } from '../types';

const MOCK_APPOINTMENTS: MarketplaceAppointment[] = [
  { id: 'apt-01', code: 'APT-001', address: '123 George St', scheduledDate: '2026-03-20', timeSlot: '09:00-12:00', latitude: -33.8688, longitude: 151.2093 },
  { id: 'apt-02', code: 'APT-002', address: '456 Pitt St', scheduledDate: '2026-03-21', timeSlot: '13:00-16:00', latitude: -33.8700, longitude: 151.2080 },
];

describe('OfferMapPins', () => {
  it('renders markers for each appointment', () => {
    render(
      <OfferMapPins
        appointments={MOCK_APPOINTMENTS}
        priorityMode="STANDARD"
        selectedId={null}
        onPinClick={vi.fn()}
      />,
    );

    const markers = screen.getAllByTestId('map-marker');
    expect(markers).toHaveLength(2);
  });

  it('uses blue color for standard priority', () => {
    render(
      <OfferMapPins
        appointments={MOCK_APPOINTMENTS}
        priorityMode="STANDARD"
        selectedId={null}
        onPinClick={vi.fn()}
      />,
    );

    const markers = screen.getAllByTestId('map-marker');
    expect(markers[0]?.getAttribute('data-color')).toBe('#2196F3');
  });

  it('uses orange color for 24h priority', () => {
    render(
      <OfferMapPins
        appointments={MOCK_APPOINTMENTS}
        priorityMode="PRIORITY_24H"
        selectedId={null}
        onPinClick={vi.fn()}
      />,
    );

    const markers = screen.getAllByTestId('map-marker');
    expect(markers[0]?.getAttribute('data-color')).toBe('#FF9800');
  });

  it('calls onPinClick when a marker is clicked', () => {
    const onPinClick = vi.fn();
    render(
      <OfferMapPins
        appointments={MOCK_APPOINTMENTS}
        priorityMode="STANDARD"
        selectedId={null}
        onPinClick={onPinClick}
      />,
    );

    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]!);
    expect(onPinClick).toHaveBeenCalledWith('apt-01');
  });

  it('renders no markers when appointments is empty', () => {
    render(
      <OfferMapPins
        appointments={[]}
        priorityMode="STANDARD"
        selectedId={null}
        onPinClick={vi.fn()}
      />,
    );

    expect(screen.queryAllByTestId('map-marker')).toHaveLength(0);
  });
});
