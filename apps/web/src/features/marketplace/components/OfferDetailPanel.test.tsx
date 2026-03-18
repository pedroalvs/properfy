import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OfferDetailPanel } from './OfferDetailPanel';
import type { MarketplaceOffer } from '../types';

const MOCK_OFFER: MarketplaceOffer = {
  id: 'off-01',
  groupId: 'grp-01',
  groupName: 'Sydney CBD',
  regionName: 'NSW',
  priorityMode: 'STANDARD',
  appointmentsCount: 2,
  totalPayout: 450,
  expiresAt: '2026-04-01T00:00:00Z',
  createdAt: '2026-03-15T00:00:00Z',
  appointments: [
    { id: 'apt-01', code: 'APT-001', address: '123 George St', scheduledDate: '2026-03-20', timeSlot: '09:00-12:00', latitude: -33.8688, longitude: 151.2093 },
    { id: 'apt-02', code: 'APT-002', address: '456 Pitt St', scheduledDate: '2026-03-21', timeSlot: '13:00-16:00', latitude: -33.8700, longitude: 151.2080 },
  ],
};

describe('OfferDetailPanel', () => {
  it('shows empty state when no offer selected', () => {
    render(<OfferDetailPanel offer={null} onAccept={vi.fn()} isAccepting={false} />);

    expect(screen.getByTestId('offer-detail-panel-empty')).toBeInTheDocument();
    expect(screen.getByText('No offer selected')).toBeInTheDocument();
  });

  it('shows offer details when offer is provided', () => {
    render(<OfferDetailPanel offer={MOCK_OFFER} onAccept={vi.fn()} isAccepting={false} />);

    expect(screen.getByTestId('offer-detail-panel')).toBeInTheDocument();
    expect(screen.getByText('Sydney CBD')).toBeInTheDocument();
    expect(screen.getByText('NSW')).toBeInTheDocument();
    expect(screen.getByText(/\$450/)).toBeInTheDocument();
  });

  it('lists appointments in table', () => {
    render(<OfferDetailPanel offer={MOCK_OFFER} onAccept={vi.fn()} isAccepting={false} />);

    expect(screen.getByText('APT-001')).toBeInTheDocument();
    expect(screen.getByText('APT-002')).toBeInTheDocument();
    expect(screen.getByText('123 George St')).toBeInTheDocument();
    expect(screen.getByText('456 Pitt St')).toBeInTheDocument();
  });

  it('shows accept button', () => {
    render(<OfferDetailPanel offer={MOCK_OFFER} onAccept={vi.fn()} isAccepting={false} />);

    expect(screen.getByRole('button', { name: /Accept Offer/i })).toBeInTheDocument();
  });

  it('calls onAccept with groupId when accept button is clicked', () => {
    const onAccept = vi.fn();
    render(<OfferDetailPanel offer={MOCK_OFFER} onAccept={onAccept} isAccepting={false} />);

    fireEvent.click(screen.getByRole('button', { name: /Accept Offer/i }));
    expect(onAccept).toHaveBeenCalledWith('grp-01');
  });

  it('shows no appointments message when appointments list is empty', () => {
    const offerNoApts = { ...MOCK_OFFER, appointments: [] };
    render(<OfferDetailPanel offer={offerNoApts} onAccept={vi.fn()} isAccepting={false} />);

    expect(screen.getByText('No appointments in this offer.')).toBeInTheDocument();
  });
});
