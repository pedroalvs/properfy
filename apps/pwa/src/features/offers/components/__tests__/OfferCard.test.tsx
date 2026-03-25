import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OfferCard } from '../OfferCard';
import type { MarketplaceOffer } from '../../types';
import { toLocalISODate } from '@/lib/format-date';

const baseOffer: MarketplaceOffer = {
  groupId: 'group-1',
  tenantName: 'Acme Realty',
  serviceTypeName: 'Routine Inspection',
  groupSize: 3,
  scheduledDate: '2026-03-20',
  timeWindow: '09:00-11:00',
  priorityMode: 'STANDARD',
  priorityExpiresAt: null,
  suburbs: ['Brunswick', 'Fitzroy'],
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
    expect(screen.getByText('Brunswick, Fitzroy')).toBeInTheDocument();
    expect(screen.getByText('Acme Realty')).toBeInTheDocument();
    expect(screen.getByText('3 inspections')).toBeInTheDocument();
    expect(screen.getByText('Standard availability')).toBeInTheDocument();
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

  it('shows TODAY badge when date is today', () => {
    vi.useRealTimers();
    const today = toLocalISODate(new Date());
    const todayOffer = { ...baseOffer, scheduledDate: today };
    render(<OfferCard offer={todayOffer} state="IDLE" onAccept={onAccept} />);
    expect(screen.getByTestId('today-badge')).toBeInTheDocument();
  });

  it('shows "1 inspection" singular', () => {
    render(
      <OfferCard offer={{ ...baseOffer, groupSize: 1 }} state="IDLE" onAccept={onAccept} />,
    );
    expect(screen.getByText('1 inspection')).toBeInTheDocument();
  });

  it('has expand/collapse details button', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    render(<OfferCard offer={baseOffer} state="IDLE" onAccept={onAccept} />);
    expect(screen.queryByTestId('offer-details-expanded')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('expand-details-button'));
    expect(screen.getByTestId('offer-details-expanded')).toBeInTheDocument();
    expect(screen.getByText('Brunswick')).toBeInTheDocument();
    expect(screen.getByText('Fitzroy')).toBeInTheDocument();
  });

  it('has role="alert" on state label', () => {
    render(<OfferCard offer={baseOffer} state="ACCEPTED" onAccept={onAccept} />);
    expect(screen.getByTestId('offer-state-label')).toHaveAttribute('role', 'alert');
  });

  it('fades to 50% opacity after 3s when ACCEPTED', () => {
    render(<OfferCard offer={baseOffer} state="ACCEPTED" onAccept={onAccept} />);
    const card = screen.getByTestId(`offer-card-${baseOffer.groupId}`);
    expect(card.className).not.toContain('opacity-50');

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(card.className).toContain('opacity-50');
  });

  it('shows priority expiration fallback', () => {
    render(<OfferCard offer={baseOffer} state="IDLE" onAccept={onAccept} />);
    expect(screen.getByTestId('priority-expiration')).toHaveTextContent('Standard availability');
  });
});
