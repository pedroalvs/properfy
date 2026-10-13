import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OfferFeed } from '../OfferFeed';
import type { MarketplaceOffer } from '../../types';

vi.mock('../OfferCard', () => ({
  OfferCard: ({ offer }: { offer: MarketplaceOffer }) => <div data-testid={`card-${offer.groupId}`} />,
}));
vi.mock('../../hooks/useAcceptOffer', () => ({
  useAcceptOffer: () => ({ getState: () => 'IDLE', startConfirm: vi.fn(), cancelConfirm: vi.fn(), accept: vi.fn() }),
}));
vi.mock('@/hooks/useIsOnline', () => ({ useIsOnline: () => true }));
vi.mock('@/hooks/useSnackbar', () => ({ useSnackbar: () => ({ showError: vi.fn() }) }));

const offers = [
  { groupId: 'g1', scheduledDate: '2026-03-26' },
  { groupId: 'g2', scheduledDate: '2026-03-27' },
] as unknown as MarketplaceOffer[];

describe('OfferFeed', () => {
  it('lays the offers out in a fluid card grid that fills the pane width', () => {
    render(<OfferFeed offers={offers} onRefresh={vi.fn()} />);
    const grid = screen.getByTestId('offer-grid');
    expect(grid.className).toContain('grid');
    // Container-driven columns: 1 on a phone, multiple as the pane widens — no viewport breakpoint.
    expect(grid.className).toContain('minmax(280px,1fr)');
    expect(screen.getByTestId('card-g1')).toBeInTheDocument();
    expect(screen.getByTestId('card-g2')).toBeInTheDocument();
  });
});
