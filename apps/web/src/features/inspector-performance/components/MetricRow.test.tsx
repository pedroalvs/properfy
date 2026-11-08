import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createRouterQueryWrapper } from '@/test-utils/test-wrappers';
import { MetricRow } from './MetricRow';
import { makeMetric } from '../__fixtures__/reliability';

function renderRow(metric: ReturnType<typeof makeMetric>, source: 'MEDIAN' | 'OVERRIDE' | null = 'MEDIAN') {
  return render(<MetricRow metric={metric} minimumRatings={3} volumeReferenceSource={source} />, {
    wrapper: createRouterQueryWrapper(),
  });
}

describe('MetricRow', () => {
  it('renders a rate metric with label, value, detail and weight', () => {
    renderRow(makeMetric('PUNCTUALITY', { rate: 0.8333, successCount: 10, weightedSuccess: 500 }));
    expect(screen.getByText('Punctuality')).toBeInTheDocument();
    expect(screen.getByText('83%')).toBeInTheDocument();
    expect(screen.getByText('10 of 12 services')).toBeInTheDocument();
    expect(screen.getByText('Weight 1')).toBeInTheDocument();
  });

  it('renders satisfaction without a weighted-minutes tooltip', () => {
    renderRow(makeMetric('SATISFACTION', { rate: 0.8125, eligibleCount: 4, successCount: null, averageRating: 4.25, weightedEligible: 0 }));
    expect(screen.getByText('4.25 / 5')).toBeInTheDocument();
    expect(screen.getByText('4 ratings')).toBeInTheDocument();
    fireEvent.focus(screen.getByText('4.25 / 5').parentElement as HTMLElement);
    expect(screen.queryByText(/weighted minutes/)).not.toBeInTheDocument();
  });

  it('shows the weighted-minutes tooltip on focus for a non-satisfaction metric', () => {
    renderRow(makeMetric('PUNCTUALITY', { rate: 0.8333, successCount: 10, weightedSuccess: 500, weightedEligible: 600 }));
    fireEvent.focus(screen.getByText('83%').parentElement as HTMLElement);
    expect(screen.getByRole('tooltip')).toHaveTextContent('500 of 600 weighted minutes');
  });

  it('renders the volume reference (median)', () => {
    renderRow(makeMetric('VOLUME', { rate: 1, successCount: 12, volumeReference: 9.5, activeDays: 30 }));
    expect(screen.getByText('Completed volume')).toBeInTheDocument();
    expect(screen.getByText('12 completed · median 9.5')).toBeInTheDocument();
  });

  it('marks a zero-weight metric as Not weighted (text, not colour)', () => {
    renderRow(makeMetric('GEOFENCE', { rate: 0.9, successCount: 11, weight: 0 }));
    expect(screen.getByText('Not weighted')).toBeInTheDocument();
  });

  it('shows the per-metric No data text for a null metric', () => {
    renderRow(makeMetric('LATE_NOTICE', { rate: null, eligibleCount: 0, successCount: null }));
    expect(screen.getByText('No data')).toBeInTheDocument();
    expect(screen.getByText('No late arrivals in this period')).toBeInTheDocument();
  });

  it('shows Not enough ratings when satisfaction is below the minimum', () => {
    renderRow(makeMetric('SATISFACTION', { rate: null, eligibleCount: 1, successCount: null, averageRating: null }));
    expect(screen.getByText('Not enough ratings')).toBeInTheDocument();
    expect(screen.getByText('1 of 3 needed')).toBeInTheDocument();
  });
});
