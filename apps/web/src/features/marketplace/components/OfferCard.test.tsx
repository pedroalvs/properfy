import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OfferCard } from './OfferCard';
import type { MarketplaceOffer } from '../types';

const MOCK_OFFER: MarketplaceOffer = {
  groupId: 'grp-01',
  groupNumber: 1057,
  code: '1057',
  tenantName: 'Sydney CBD',
  serviceTypeName: 'Routine Inspection',
  groupSize: 3,
  scheduledDate: '2026-03-20',
  timeWindow: '09:00-12:00',
  suburbs: ['Sydney CBD'],
};

describe('OfferCard', () => {
  it('renders offer info: service, client, count, date', () => {
    render(<OfferCard offer={MOCK_OFFER} selected={false} onClick={vi.fn()} onAccept={vi.fn()} />);

    expect(screen.getByText('Routine Inspection')).toBeInTheDocument();
    expect(screen.getAllByText('Sydney CBD').length).toBeGreaterThan(0);
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('09:00-12:00')).toBeInTheDocument();
    expect(screen.getByText('#1057')).toBeInTheDocument();
  });

  it('does not render a priority badge', () => {
    render(<OfferCard offer={MOCK_OFFER} selected={false} onClick={vi.fn()} onAccept={vi.fn()} />);

    expect(screen.queryByTestId('priority-badge')).not.toBeInTheDocument();
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
