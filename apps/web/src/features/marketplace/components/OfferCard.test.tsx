import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OfferCard } from './OfferCard';
import type { MarketplaceOffer } from '../types';

const MOCK_OFFER: MarketplaceOffer = {
  id: 'off-01',
  groupId: 'grp-01',
  groupName: 'Sydney CBD',
  regionName: 'NSW',
  priorityMode: 'STANDARD',
  appointmentsCount: 3,
  totalPayout: 450,
  expiresAt: '2026-04-01T00:00:00Z',
  createdAt: '2026-03-15T00:00:00Z',
  appointments: [],
};

const MOCK_PRIORITY_OFFER: MarketplaceOffer = {
  ...MOCK_OFFER,
  id: 'off-02',
  groupId: 'grp-02',
  groupName: 'Melbourne Inner',
  priorityMode: 'PRIORITY_24H',
};

describe('OfferCard', () => {
  it('renders offer info: name, region, count, payout', () => {
    render(<OfferCard offer={MOCK_OFFER} selected={false} onClick={vi.fn()} onAccept={vi.fn()} />);

    expect(screen.getByText('Sydney CBD')).toBeInTheDocument();
    expect(screen.getByText('NSW')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText(/\$450/)).toBeInTheDocument();
  });

  it('shows standard priority badge', () => {
    render(<OfferCard offer={MOCK_OFFER} selected={false} onClick={vi.fn()} onAccept={vi.fn()} />);

    expect(screen.getByTestId('priority-badge')).toHaveTextContent('Standard');
  });

  it('shows 24h priority badge', () => {
    render(<OfferCard offer={MOCK_PRIORITY_OFFER} selected={false} onClick={vi.fn()} onAccept={vi.fn()} />);

    expect(screen.getByTestId('priority-badge')).toHaveTextContent('24h Priority');
  });

  it('calls onClick when card is clicked', () => {
    const onClick = vi.fn();
    render(<OfferCard offer={MOCK_OFFER} selected={false} onClick={onClick} onAccept={vi.fn()} />);

    fireEvent.click(screen.getByTestId('offer-card'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('calls onAccept when Accept button is clicked', () => {
    const onAccept = vi.fn();
    const onClick = vi.fn();
    render(<OfferCard offer={MOCK_OFFER} selected={false} onClick={onClick} onAccept={onAccept} />);

    const buttons = screen.getAllByRole('button', { name: /Accept/i });
    // The inner Accept <button> element (not the card div with role="button")
    const acceptButton = buttons.find((btn) => btn.tagName === 'BUTTON')!;
    fireEvent.click(acceptButton);
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('highlights when selected', () => {
    const { container } = render(
      <OfferCard offer={MOCK_OFFER} selected={true} onClick={vi.fn()} onAccept={vi.fn()} />,
    );

    const card = container.querySelector('[data-testid="offer-card"]');
    expect(card?.className).toContain('ring-2');
    expect(card?.className).toContain('border-secondary');
  });

  it('does not highlight when not selected', () => {
    const { container } = render(
      <OfferCard offer={MOCK_OFFER} selected={false} onClick={vi.fn()} onAccept={vi.fn()} />,
    );

    const card = container.querySelector('[data-testid="offer-card"]');
    expect(card?.className).not.toContain('ring-2');
  });
});
