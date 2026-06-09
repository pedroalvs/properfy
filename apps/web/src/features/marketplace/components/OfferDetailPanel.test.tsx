import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { OfferDetailPanel } from './OfferDetailPanel';
import type { MarketplaceOffer, MarketplaceOfferDetail } from '../types';

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

function makeDetailAppointment(overrides: Partial<MarketplaceOfferDetail['appointments'][number]> = {}) {
  return {
    id: 'apt-1',
    appointmentCode: 'INS-0001',
    appointmentNumber: 1,
    suburb: 'Sydney CBD',
    keyRequired: false,
    notes: null,
    payoutAmount: 150,
    tenantName: 'Acme Realty',
    ...overrides,
  };
}

const MOCK_DETAIL_MIXED: MarketplaceOfferDetail = {
  groupId: 'grp-01',
  tenantName: 'Multiple agencies',
  serviceTypeName: 'Routine Inspection',
  groupSize: 2,
  scheduledDate: '2026-03-20',
  timeWindow: '09:00-12:00',
  priorityMode: 'STANDARD',
  priorityExpiresAt: '2026-04-01T00:00:00Z',
  suburbs: ['Sydney CBD', 'Surry Hills'],
  payoutEstimate: 300,
  appointmentCount: 2,
  centroid: null,
  addresses: ['1 George St, Sydney CBD', '2 Crown St, Surry Hills'],
  keyRequired: false,
  notes: null,
  appointments: [
    makeDetailAppointment({ id: 'apt-1', appointmentCode: 'ACM-0001', suburb: 'Sydney CBD', tenantName: 'Acme Realty' }),
    makeDetailAppointment({ id: 'apt-2', appointmentCode: 'GLX-0002', suburb: 'Surry Hills', tenantName: 'Globex Property' }),
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

  it('lists each appointment with its own agency for a cross-agency group', () => {
    render(
      <OfferDetailPanel offer={MOCK_OFFER} detail={MOCK_DETAIL_MIXED} onAccept={vi.fn()} isAccepting={false} />,
    );

    const agencies = screen.getAllByTestId('offer-appointment-agency').map((el) => el.textContent);
    expect(agencies).toEqual(['Acme Realty', 'Globex Property']);
    const list = within(screen.getByTestId('offer-appointment-list'));
    expect(list.getByText('Sydney CBD')).toBeInTheDocument();
    expect(list.getByText('Surry Hills')).toBeInTheDocument();
  });

  it('renders a single agency for a single-agency group', () => {
    const singleAgency: MarketplaceOfferDetail = {
      ...MOCK_DETAIL_MIXED,
      tenantName: 'Acme Realty',
      appointments: [
        makeDetailAppointment({ id: 'apt-1', tenantName: 'Acme Realty', suburb: 'Sydney CBD' }),
        makeDetailAppointment({ id: 'apt-2', tenantName: 'Acme Realty', suburb: 'Surry Hills' }),
      ],
    };
    render(
      <OfferDetailPanel offer={MOCK_OFFER} detail={singleAgency} onAccept={vi.fn()} isAccepting={false} />,
    );

    const agencies = screen.getAllByTestId('offer-appointment-agency').map((el) => el.textContent);
    expect(agencies).toEqual(['Acme Realty', 'Acme Realty']);
  });

  it('does not render the appointment breakdown when no detail is provided', () => {
    render(<OfferDetailPanel offer={MOCK_OFFER} onAccept={vi.fn()} isAccepting={false} />);

    expect(screen.queryByTestId('offer-appointment-agency')).not.toBeInTheDocument();
  });
});
