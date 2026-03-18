import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OfferCard } from '../OfferCard';
import type { MarketplaceOffer } from '../../types';

const baseOffer: MarketplaceOffer = {
  groupId: 'group-1',
  serviceTypeName: 'Routine Inspection',
  flowType: 'ROUTINE',
  scheduledDate: '2026-03-20',
  timeWindowStart: '2026-03-20T09:00:00.000Z',
  timeWindowEnd: '2026-03-20T11:00:00.000Z',
  region: 'Brunswick, Fitzroy',
  suburbs: ['Brunswick', 'Fitzroy'],
  appointmentCount: 3,
  confirmedCount: 2,
  pendingCount: 1,
  distance: 5.2,
  publishedAt: '2026-03-18T00:00:00.000Z',
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
    expect(screen.getByText('3 inspections')).toBeInTheDocument();
    expect(screen.getByText('~5 km away')).toBeInTheDocument();
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
    const today = new Date().toISOString().split('T')[0]!;
    const todayOffer = { ...baseOffer, scheduledDate: today };
    render(<OfferCard offer={todayOffer} state="IDLE" onAccept={onAccept} />);
    expect(screen.getByTestId('today-badge')).toBeInTheDocument();
  });

  it('shows "1 inspection" singular', () => {
    render(
      <OfferCard offer={{ ...baseOffer, appointmentCount: 1 }} state="IDLE" onAccept={onAccept} />,
    );
    expect(screen.getByText('1 inspection')).toBeInTheDocument();
  });

  it('shows confirmation chips with counts', () => {
    render(<OfferCard offer={baseOffer} state="IDLE" onAccept={onAccept} />);
    expect(screen.getByTestId('confirmation-chips')).toBeInTheDocument();
    expect(screen.getByText('2 confirmed')).toBeInTheDocument();
    expect(screen.getByText('1 pending')).toBeInTheDocument();
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

  it('shows confirmation progress bar in expanded details', async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    render(<OfferCard offer={baseOffer} state="IDLE" onAccept={onAccept} />);
    await user.click(screen.getByTestId('expand-details-button'));
    expect(screen.getByTestId('confirmation-progress-bar')).toBeInTheDocument();
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

  it('shows published relative time', () => {
    render(<OfferCard offer={baseOffer} state="IDLE" onAccept={onAccept} />);
    expect(screen.getByTestId('published-time')).toBeInTheDocument();
  });
});
