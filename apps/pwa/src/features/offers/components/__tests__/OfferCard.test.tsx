import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OfferCard } from '../OfferCard';
import type { MarketplaceOffer } from '../../types';
import { toLocalISODate } from '@/lib/format-date';

const baseOffer: MarketplaceOffer = {
  groupId: 'group-1',
  groupNumber: 1057,
  code: '1057',
  tenantName: 'Acme Realty',
  serviceTypeName: 'Routine Inspection',
  groupSize: 3,
  scheduledDate: '2026-03-20',
  timeWindow: '09:00-11:00',
  priorityMode: 'STANDARD',
  priorityExpiresAt: null,
  suburbs: ['Brunswick', 'Fitzroy'],
  payoutEstimate: null,
  appointmentCount: 3,
};

describe('OfferCard', () => {
  const onAccept = vi.fn();

  beforeEach(() => {
    onAccept.mockClear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders offer details', () => {
    render(<OfferCard offer={baseOffer} state="IDLE" onAccept={onAccept} />);
    expect(screen.getByText('Routine Inspection')).toBeInTheDocument();
    expect(screen.getByText(/Brunswick/)).toBeInTheDocument();
    expect(screen.getByText('Acme Realty')).toBeInTheDocument();
    expect(screen.getByText('3 inspections')).toBeInTheDocument();
    expect(screen.getByText('#1057')).toBeInTheDocument();
  });

  it('shows Accept button for IDLE state', () => {
    render(<OfferCard offer={baseOffer} state="IDLE" onAccept={onAccept} />);
    expect(screen.getByTestId('accept-button')).toBeInTheDocument();
  });

  it('calls onAccept when Accept is clicked', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    render(<OfferCard offer={baseOffer} state="IDLE" onAccept={onAccept} />);
    await user.click(screen.getByTestId('accept-button'));
    expect(onAccept).toHaveBeenCalledOnce();
  });

  it('shows ACCEPTED state label', () => {
    render(<OfferCard offer={baseOffer} state="ACCEPTED" onAccept={onAccept} />);
    expect(screen.getByTestId('offer-state-label')).toHaveTextContent('Accepted');
  });

  it('shows CONFLICT state label', () => {
    render(<OfferCard offer={baseOffer} state="CONFLICT" onAccept={onAccept} />);
    expect(screen.getByTestId('offer-state-label')).toHaveTextContent('Already taken');
  });

  it('shows GONE state label', () => {
    render(<OfferCard offer={baseOffer} state="GONE" onAccept={onAccept} />);
    expect(screen.getByTestId('offer-state-label')).toHaveTextContent('No longer available');
  });

  it('shows Accept button for ERROR state so user can retry immediately', () => {
    render(<OfferCard offer={baseOffer} state="ERROR" onAccept={onAccept} />);
    expect(screen.getByTestId('accept-button')).toBeInTheDocument();
    expect(screen.queryByTestId('offer-state-label')).not.toBeInTheDocument();
  });

  it('shows day badge when date is today', () => {
    vi.useRealTimers();
    const today = toLocalISODate(new Date());
    const todayOffer = { ...baseOffer, scheduledDate: today };
    render(<OfferCard offer={todayOffer} state="IDLE" onAccept={onAccept} />);
    expect(screen.getByTestId('day-badge')).toHaveTextContent('TODAY');
  });

  it('shows "1 inspection" singular', () => {
    render(
      <OfferCard offer={{ ...baseOffer, groupSize: 1, appointmentCount: 1 }} state="IDLE" onAccept={onAccept} />,
    );
    expect(screen.getByText('1 inspection')).toBeInTheDocument();
  });

  it('shows payout estimate when provided', () => {
    render(
      <OfferCard offer={{ ...baseOffer, payoutEstimate: 220 }} state="IDLE" onAccept={onAccept} />,
    );
    expect(screen.getByTestId('payout-estimate')).toBeInTheDocument();
  });

  it('has role="alert" on state label', () => {
    render(<OfferCard offer={baseOffer} state="ACCEPTED" onAccept={onAccept} />);
    expect(screen.getByTestId('offer-state-label')).toHaveAttribute('role', 'alert');
  });

  it('fades after 3s when ACCEPTED', () => {
    render(<OfferCard offer={baseOffer} state="ACCEPTED" onAccept={onAccept} />);
    const card = screen.getByTestId(`offer-card-${baseOffer.groupId}`);
    expect(card.className).not.toContain('opacity-40');

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(card.className).toContain('opacity-40');
  });

  it('shows priority countdown when priorityExpiresAt is set', () => {
    vi.useRealTimers();
    const future = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
    render(
      <OfferCard
        offer={{ ...baseOffer, priorityExpiresAt: future }}
        state="IDLE"
        onAccept={onAccept}
      />,
    );
    expect(screen.getByTestId('priority-countdown')).toBeInTheDocument();
  });
});
