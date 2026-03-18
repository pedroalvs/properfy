import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GeocodingStatus } from '@properfy/shared';
import { GeocodingStatusBadge } from './GeocodingStatusBadge';

describe('GeocodingStatusBadge', () => {
  it('renders PENDING with correct label and spinning icon', () => {
    const { container } = render(<GeocodingStatusBadge status={GeocodingStatus.PENDING} />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
    const icon = container.querySelector('i.mdi-loading');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveClass('mdi-spin');
  });

  it('renders SUCCESS with correct label and map marker icon', () => {
    const { container } = render(<GeocodingStatusBadge status={GeocodingStatus.SUCCESS} />);
    expect(screen.getByText('Success')).toBeInTheDocument();
    const icon = container.querySelector('i.mdi-map-marker');
    expect(icon).toBeInTheDocument();
    expect(icon).not.toHaveClass('mdi-spin');
  });

  it('renders FAILED with correct label and alert icon', () => {
    const { container } = render(<GeocodingStatusBadge status={GeocodingStatus.FAILED} />);
    expect(screen.getByText('Failed')).toBeInTheDocument();
    const icon = container.querySelector('i.mdi-alert-circle');
    expect(icon).toBeInTheDocument();
    expect(icon).not.toHaveClass('mdi-spin');
  });

  it('renders MANUAL with correct label and check icon', () => {
    const { container } = render(<GeocodingStatusBadge status={GeocodingStatus.MANUAL} />);
    expect(screen.getByText('Manual')).toBeInTheDocument();
    const icon = container.querySelector('i.mdi-map-marker-check');
    expect(icon).toBeInTheDocument();
    expect(icon).not.toHaveClass('mdi-spin');
  });

  it('applies correct background color from status map', () => {
    render(<GeocodingStatusBadge status={GeocodingStatus.SUCCESS} />);
    const badge = screen.getByText('Success').closest('span')!;
    expect(badge.style.backgroundColor).toBe('var(--color-geocoding-success)');
  });

  it('renders all 4 statuses', () => {
    const statuses = Object.values(GeocodingStatus) as GeocodingStatus[];
    const { container } = render(
      <>
        {statuses.map((s) => (
          <GeocodingStatusBadge key={s} status={s} />
        ))}
      </>,
    );
    const badges = container.querySelectorAll('span.inline-flex');
    expect(badges).toHaveLength(4);
  });

  it('renders sm size with smaller text classes', () => {
    render(<GeocodingStatusBadge status={GeocodingStatus.SUCCESS} size="sm" />);
    const badge = screen.getByText('Success').closest('span')!;
    expect(badge.className).toContain('text-xs');
    expect(badge.className).toContain('px-2');
  });

  it('renders md size by default with larger text classes', () => {
    render(<GeocodingStatusBadge status={GeocodingStatus.SUCCESS} />);
    const badge = screen.getByText('Success').closest('span')!;
    expect(badge.className).toContain('text-sm');
    expect(badge.className).toContain('px-2.5');
  });
});
