import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { PropertyIssueResponse } from '@properfy/shared';
import { PropertyIssueCard } from './PropertyIssueCard';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function issue(overrides: Partial<PropertyIssueResponse> = {}): PropertyIssueResponse {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    propertyId: '22222222-2222-4222-8222-222222222222',
    appointmentId: null,
    reason: 'Leaking tap in the bathroom',
    source: 'STAFF' as PropertyIssueResponse['source'],
    createdByUserId: '33333333-3333-4333-8333-333333333333',
    cantDoEventId: null,
    seenAt: null,
    seenByUserId: null,
    createdAt: '2026-11-07T00:00:00.000Z',
    photos: [],
    ...overrides,
  };
}

describe('PropertyIssueCard', () => {
  it('shows the source label as author and never a raw id (privacy)', () => {
    const { container } = render(
      <PropertyIssueCard
        issue={issue({ source: 'INSPECTOR' as PropertyIssueResponse['source'] })}
        currentUserId="me"
        onOpenPhoto={vi.fn()}
      />,
    );
    expect(screen.getByText('Inspector')).toBeInTheDocument();
    expect(screen.getByText('Leaking tap in the bathroom')).toBeInTheDocument();
    // No raw user/issue id anywhere in the rendered card.
    expect(container.textContent ?? '').not.toMatch(UUID_RE);
  });

  it('renders "No photos" when the issue has none', () => {
    render(<PropertyIssueCard issue={issue()} currentUserId="me" onOpenPhoto={vi.fn()} />);
    expect(screen.getByText('No photos')).toBeInTheDocument();
  });

  it('offers Mark as seen only when allowed, and shows the seen state otherwise', () => {
    const onMarkSeen = vi.fn();
    const { rerender } = render(
      <PropertyIssueCard issue={issue()} currentUserId="me" onOpenPhoto={vi.fn()} onMarkSeen={onMarkSeen} />,
    );
    expect(screen.getByRole('button', { name: 'Mark as seen' })).toBeInTheDocument();

    rerender(
      <PropertyIssueCard
        issue={issue({ seenAt: '2026-11-07T03:30:00.000Z', seenByUserId: 'me' })}
        currentUserId="me"
        onOpenPhoto={vi.fn()}
        onMarkSeen={onMarkSeen}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Mark as seen' })).not.toBeInTheDocument();
    expect(screen.getByText(/Seen ·/)).toBeInTheDocument();
    expect(screen.getByText(/by you/)).toBeInTheDocument();
  });

  it('shows "Not seen" (no action) for a viewer who cannot mark seen', () => {
    render(<PropertyIssueCard issue={issue()} currentUserId="me" onOpenPhoto={vi.fn()} />);
    expect(screen.getByText('Not seen')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark as seen' })).not.toBeInTheDocument();
  });
});
