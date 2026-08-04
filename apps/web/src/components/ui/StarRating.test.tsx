import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StarRating } from './StarRating';

describe('StarRating', () => {
  it('renders the average to two decimals with the response count', () => {
    render(<StarRating value={4.8} count={12} showValue />);

    expect(screen.getByText('4.80')).toBeInTheDocument();
    expect(screen.getByText('(12)')).toBeInTheDocument();
  });

  it('describes itself to assistive tech in words, not glyphs', () => {
    render(<StarRating value={4.8} count={12} showValue />);

    const label = screen.getByRole('img').getAttribute('aria-label');
    expect(label).toContain('4.8');
    expect(label).toContain('out of 5');
    expect(label).toContain('12');
  });

  it('renders an empty state rather than a zero score when unrated', () => {
    // The distinction the whole null-not-zero contract exists to protect: an
    // inspector with no feedback has not scored 0.00.
    render(<StarRating value={null} count={0} showValue />);

    expect(screen.queryByText('0.00')).not.toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(screen.getByRole('img').getAttribute('aria-label')).toMatch(/no ratings/i);
  });

  it('honours a custom empty label', () => {
    render(<StarRating value={null} count={0} emptyLabel="No ratings yet" />);

    expect(screen.getByText('No ratings yet')).toBeInTheDocument();
  });

  it('omits the numeral when showValue is off', () => {
    render(<StarRating value={4.8} count={12} />);

    expect(screen.queryByText('4.80')).not.toBeInTheDocument();
    // Still announced, so the information is not lost for screen-reader users.
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('4.8');
  });

  it('omits the count when there is none to show', () => {
    render(<StarRating value={5} showValue />);

    expect(screen.queryByText(/\(\d+\)/)).not.toBeInTheDocument();
  });
});
