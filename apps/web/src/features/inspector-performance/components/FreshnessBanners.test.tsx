import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FreshnessBanners } from './FreshnessBanners';

const NINE_AM_SYD = new Date('2026-12-01T22:00:00Z');
const COMPUTED = '2026-12-01T17:15:00.000Z';
const CHANGED = '2026-12-01T23:00:00.000Z'; // 10:00 am Sydney

describe('FreshnessBanners', () => {
  it('renders nothing when fresh', () => {
    const { container } = render(
      <FreshnessBanners isStale={false} snapshotDate="2026-12-02" settingsUpdatedAt={null} computedAt={COMPUTED} now={NINE_AM_SYD} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the stale warning (role=status) with the D MMM YYYY date', () => {
    render(
      <FreshnessBanners isStale snapshotDate="2026-12-01" settingsUpdatedAt={null} computedAt={COMPUTED} now={NINE_AM_SYD} />,
    );
    const banner = screen.getByText(
      "Scores haven't been updated since 1 Dec 2026. The nightly job didn't finish; operations has been notified.",
    );
    expect(banner).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows the pending-recompute warning within 15 minutes', () => {
    render(
      <FreshnessBanners
        isStale={false}
        snapshotDate="2026-12-01"
        settingsUpdatedAt={CHANGED}
        computedAt={COMPUTED}
        now={new Date('2026-12-01T23:05:00.000Z')}
      />,
    );
    expect(
      screen.getByText('Weights were changed at 10:00 am. Scores will update within a few minutes.'),
    ).toBeInTheDocument();
  });

  it('shows the overdue-recompute warning after 15 minutes', () => {
    render(
      <FreshnessBanners
        isStale={false}
        snapshotDate="2026-12-01"
        settingsUpdatedAt={CHANGED}
        computedAt={COMPUTED}
        now={new Date('2026-12-01T23:20:00.000Z')}
      />,
    );
    expect(
      screen.getByText(
        "Weights were changed at 10:00 am but scores haven't been recalculated yet. Operations has been notified.",
      ),
    ).toBeInTheDocument();
  });

  it('can show both banners at once', () => {
    render(
      <FreshnessBanners
        isStale
        snapshotDate="2026-12-01"
        settingsUpdatedAt={CHANGED}
        computedAt={COMPUTED}
        now={new Date('2026-12-01T23:20:00.000Z')}
      />,
    );
    expect(screen.getAllByRole('status')).toHaveLength(2);
  });
});
