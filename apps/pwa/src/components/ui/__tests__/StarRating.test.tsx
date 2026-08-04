import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StarRating } from '../StarRating';

/**
 * Mirrors apps/web's StarRating suite. The two components are duplicated by
 * design (no shared UI package), so both need their own coverage of the
 * null-is-not-zero contract.
 */
describe('StarRating (pwa)', () => {
  it('renders the average to two decimals', () => {
    render(<StarRating value={4.8} showValue />);

    expect(screen.getByText('4.80')).toBeInTheDocument();
  });

  it('renders an empty state rather than a zero score when unrated', () => {
    render(<StarRating value={null} showValue emptyLabel="No ratings yet" />);

    expect(screen.queryByText('0.00')).not.toBeInTheDocument();
    expect(screen.getByText('No ratings yet')).toBeInTheDocument();
  });

  it('describes itself in words for assistive tech', () => {
    render(<StarRating value={4.8} count={12} showValue />);

    const label = screen.getByRole('img').getAttribute('aria-label');
    expect(label).toContain('out of 5');
    expect(label).toContain('12');
  });
});
