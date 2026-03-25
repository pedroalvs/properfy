import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OfferDetailPanel } from './OfferDetailPanel';
import type { MarketplaceOffer } from '../types';

const MOCK_OFFER: MarketplaceOffer = {
  groupId: 'grp-01',
  tenantName: 'Sydney CBD',
  serviceTypeName: 'Routine Inspection',
  priorityMode: 'STANDARD',
  groupSize: 2,
  scheduledDate: '2026-03-20',
  timeWindow: '09:00-12:00',
  priorityExpiresAt: '2026-04-01T00:00:00Z',
  suburbs: ['Sydney CBD', 'Surry Hills'],
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
    expect(screen.getByText('Routine Inspection')).toBeInTheDocument();
    expect(screen.getAllByText('Sydney CBD').length).toBeGreaterThan(0);
    expect(screen.getByText('09:00-12:00')).toBeInTheDocument();
  });

  it('shows suburbs summary', () => {
    render(<OfferDetailPanel offer={MOCK_OFFER} onAccept={vi.fn()} isAccepting={false} />);

    expect(screen.getByText(/Sydney CBD, Surry Hills/)).toBeInTheDocument();
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

  it('shows fallback when suburbs list is empty', () => {
    const offerNoApts = { ...MOCK_OFFER, suburbs: [] };
    render(<OfferDetailPanel offer={offerNoApts} onAccept={vi.fn()} isAccepting={false} />);

    expect(screen.getByText(/Not informed/)).toBeInTheDocument();
  });
});
