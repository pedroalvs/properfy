import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OfferAccordionList } from '../OfferAccordionList';
import type { MarketplaceOffer, OfferAcceptState } from '../../types';

// Stub the header card (its real deps pull in Auth/timezone context) so the
// accordion's own logic is what the test exercises; keep the testids it asserts.
vi.mock('../OfferCard', () => ({
  OfferCard: ({
    offer,
    onViewDetail,
    showAccept,
    expanded,
  }: {
    offer: { groupId: string };
    onViewDetail?: () => void;
    showAccept?: boolean;
    expanded?: boolean;
  }) => (
    <div data-testid={`offer-card-${offer.groupId}`} data-expanded={expanded ? 'true' : 'false'}>
      <button data-testid="view-detail-button" onClick={onViewDetail}>
        toggle
      </button>
      {showAccept && <button data-testid="accept-button">accept</button>}
    </div>
  ),
}));

// The expanded body fetches detail via React Query — stub it so the accordion's
// own logic (which item expands, accept wiring) is what the test exercises. The
// accept CTA renders only when onAccept is given, mirroring the real component.
vi.mock('../GroupDetailContent', () => ({
  GroupDetailContent: ({ groupId, onAccept }: { groupId: string | null; onAccept?: () => void }) => (
    <div data-testid={`detail-content-${groupId}`}>
      {onAccept && (
        <button data-testid="accept-group" onClick={onAccept}>
          Accept group
        </button>
      )}
    </div>
  ),
}));

function makeOffer(overrides: Partial<MarketplaceOffer> = {}): MarketplaceOffer {
  return {
    groupId: 'g1',
    groupNumber: 1,
    code: '1',
    tenantName: 'Acme Realty',
    serviceTypeName: 'Routine Inspection',
    groupSize: 2,
    scheduledDate: '2026-08-01',
    timeWindow: '08:00-12:00',
    priorityMode: 'NONE',
    priorityExpiresAt: null,
    suburbs: ['Sydney'],
    payoutEstimate: 160,
    appointmentCount: 2,
    centroid: { lat: -33.87, lng: 151.21 },
    properties: [],
    ...overrides,
  };
}

const offers = [
  makeOffer({ groupId: 'g1', scheduledDate: '2026-08-01' }),
  makeOffer({ groupId: 'g2', scheduledDate: '2026-08-02' }),
];

const idle = () => 'IDLE' as OfferAcceptState;

describe('OfferAccordionList', () => {
  const onToggle = vi.fn();
  const onAcceptGroup = vi.fn();
  const onRefresh = vi.fn();

  beforeEach(() => {
    onToggle.mockClear();
    onAcceptGroup.mockClear();
    onRefresh.mockClear();
  });

  it('shows the empty state with a refresh action when there are no offers', () => {
    render(
      <OfferAccordionList
        offers={[]}
        expandedGroupId={null}
        onToggle={onToggle}
        getState={idle}
        onAcceptGroup={onAcceptGroup}
        onRefresh={onRefresh}
      />,
    );
    expect(screen.getByText('No offers available')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('renders one card per offer and no expanded detail when nothing is selected', () => {
    render(
      <OfferAccordionList
        offers={offers}
        expandedGroupId={null}
        onToggle={onToggle}
        getState={idle}
        onAcceptGroup={onAcceptGroup}
        onRefresh={onRefresh}
      />,
    );
    expect(screen.getByTestId('offer-card-g1')).toBeInTheDocument();
    expect(screen.getByTestId('offer-card-g2')).toBeInTheDocument();
    expect(screen.queryByTestId('detail-content-g1')).toBeNull();
    // No inline "Accept offer" on the collapsed headers — accept lives in the panel.
    expect(screen.queryByTestId('accept-button')).toBeNull();
  });

  it('toggles an offer open via its header button', () => {
    render(
      <OfferAccordionList
        offers={offers}
        expandedGroupId={null}
        onToggle={onToggle}
        getState={idle}
        onAcceptGroup={onAcceptGroup}
        onRefresh={onRefresh}
      />,
    );
    fireEvent.click(screen.getAllByTestId('view-detail-button')[0]);
    expect(onToggle).toHaveBeenCalledWith('g1');
  });

  it('renders the detail only for the expanded offer', () => {
    render(
      <OfferAccordionList
        offers={offers}
        expandedGroupId="g2"
        onToggle={onToggle}
        getState={idle}
        onAcceptGroup={onAcceptGroup}
        onRefresh={onRefresh}
      />,
    );
    expect(screen.getByTestId('detail-content-g2')).toBeInTheDocument();
    expect(screen.queryByTestId('detail-content-g1')).toBeNull();
  });

  it('wires the panel accept to onAcceptGroup for the expanded offer', () => {
    render(
      <OfferAccordionList
        offers={offers}
        expandedGroupId="g1"
        onToggle={onToggle}
        getState={idle}
        onAcceptGroup={onAcceptGroup}
        onRefresh={onRefresh}
      />,
    );
    fireEvent.click(screen.getByTestId('accept-group'));
    expect(onAcceptGroup).toHaveBeenCalledWith('g1');
  });

  it('does not offer a live accept for a resolved (accepted/taken/gone) offer', () => {
    const getState = (id: string): OfferAcceptState => (id === 'g1' ? 'ACCEPTED' : 'IDLE');
    render(
      <OfferAccordionList
        offers={offers}
        expandedGroupId="g1"
        onToggle={onToggle}
        getState={getState}
        onAcceptGroup={onAcceptGroup}
        onRefresh={onRefresh}
      />,
    );
    expect(screen.getByTestId('detail-content-g1')).toBeInTheDocument();
    expect(screen.queryByTestId('accept-group')).toBeNull();
  });

  it('exposes the expanded panel as a labelled region tied to its toggle', () => {
    render(
      <OfferAccordionList
        offers={offers}
        expandedGroupId="g1"
        onToggle={onToggle}
        getState={idle}
        onAcceptGroup={onAcceptGroup}
        onRefresh={onRefresh}
      />,
    );
    const panel = screen.getByTestId('offer-detail-g1');
    expect(panel).toHaveAttribute('role', 'region');
    expect(panel).toHaveAttribute('id', 'offer-detail-g1');
    expect(panel.getAttribute('aria-label')).toMatch(/Inspections for/);
  });

  it('sinks resolved offers below open ones', () => {
    const getState = (id: string): OfferAcceptState => (id === 'g1' ? 'GONE' : 'IDLE');
    render(
      <OfferAccordionList
        offers={offers}
        expandedGroupId={null}
        onToggle={onToggle}
        getState={getState}
        onAcceptGroup={onAcceptGroup}
        onRefresh={onRefresh}
      />,
    );
    const cards = screen.getAllByTestId(/^offer-card-/);
    // g1 is GONE, so it sorts after g2 despite its earlier date.
    expect(cards.map((c) => c.getAttribute('data-testid'))).toEqual(['offer-card-g2', 'offer-card-g1']);
  });
});
