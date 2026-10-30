import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { AnnouncementsPage } from '../AnnouncementsPage';

const useMyNoticesMock = vi.fn();
vi.mock('../../hooks/useMyNotices', () => ({ useMyNotices: () => useMyNoticesMock() }));
vi.mock('@/hooks/useEffectiveTimezone', () => ({ useEffectiveTimezone: () => 'Australia/Sydney' }));

const NOTICES = [
  {
    id: 'a1',
    title: 'Road closure',
    body: 'Pacific Hwy closed northbound until Friday.',
    critical: true,
    publishedAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
    readAt: null,
  },
  {
    id: 'a2',
    title: 'New payout schedule',
    body: 'Payouts now run weekly.',
    critical: false,
    publishedAt: new Date(Date.now() - 2 * 3600_000).toISOString(),
    readAt: '2026-11-01T00:00:00Z',
  },
];

function base(partial: Record<string, unknown>) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    isFetchingNextPage: false,
    ...partial,
  };
}

describe('AnnouncementsPage', () => {
  beforeEach(() => useMyNoticesMock.mockReset());

  it('renders the notices in a list with unread marking and a critical chip', () => {
    useMyNoticesMock.mockReturnValue(base({ data: { pages: [{ data: NOTICES }] } }));
    renderWithProviders(<AnnouncementsPage />);
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Road closure, unread' })).toHaveAttribute(
      'href',
      '/profile/announcements/a1',
    );
    expect(screen.getByRole('link', { name: 'New payout schedule' })).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
  });

  it('shows the empty state when there are no notices', () => {
    useMyNoticesMock.mockReturnValue(base({ data: { pages: [{ data: [] }] } }));
    renderWithProviders(<AnnouncementsPage />);
    expect(screen.getByText('No announcements yet')).toBeInTheDocument();
    expect(
      screen.getByText('Messages from the Properfy team will show up here.'),
    ).toBeInTheDocument();
  });

  it('shows the error state with a Retry action', async () => {
    const refetch = vi.fn();
    useMyNoticesMock.mockReturnValue(base({ isError: true, refetch }));
    renderWithProviders(<AnnouncementsPage />);
    expect(screen.getByText("Couldn't load announcements.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows skeletons while loading', () => {
    useMyNoticesMock.mockReturnValue(base({ isLoading: true }));
    renderWithProviders(<AnnouncementsPage />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('loads more pages when there is a next page', async () => {
    const fetchNextPage = vi.fn();
    useMyNoticesMock.mockReturnValue(
      base({ data: { pages: [{ data: NOTICES }] }, hasNextPage: true, fetchNextPage }),
    );
    renderWithProviders(<AnnouncementsPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(fetchNextPage).toHaveBeenCalled();
  });
});
