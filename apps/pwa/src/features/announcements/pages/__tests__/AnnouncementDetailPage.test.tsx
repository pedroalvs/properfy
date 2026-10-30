import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { ApiError } from '@properfy/shared';
import { renderWithProviders } from '@/test-utils';
import { AnnouncementDetailPage } from '../AnnouncementDetailPage';

const useDetailQueryMock = vi.fn();
vi.mock('@/hooks/useApiQuery', () => ({ useDetailQuery: () => useDetailQueryMock() }));

const mutate = vi.fn();
vi.mock('../../hooks/useMarkNoticeRead', () => ({ useMarkNoticeRead: () => ({ mutate }) }));
vi.mock('@/hooks/useEffectiveTimezone', () => ({ useEffectiveTimezone: () => 'Australia/Sydney' }));

const NOTICE_ID = '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed';

function renderDetail(id = NOTICE_ID) {
  return renderWithProviders(
    <Routes>
      <Route path="/profile/announcements/:noticeId" element={<AnnouncementDetailPage />} />
    </Routes>,
    { initialEntries: [`/profile/announcements/${id}`] },
  );
}

const NOTICE = {
  id: NOTICE_ID,
  title: 'Road closure',
  body: 'Line one\nLine two',
  critical: true,
  publishedAt: '2026-11-09T22:30:00Z',
  readAt: null as string | null,
};

function query(partial: Record<string, unknown>) {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    ...partial,
  };
}

describe('AnnouncementDetailPage', () => {
  beforeEach(() => {
    useDetailQueryMock.mockReset();
    mutate.mockReset();
  });

  it('marks an unread notice read exactly once on open', () => {
    useDetailQueryMock.mockReturnValue(query({ data: { data: { ...NOTICE, readAt: null } } }));
    renderDetail();
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(NOTICE_ID);
  });

  it('shows not-found for a non-UUID id without querying or marking read (CSPT guard)', () => {
    useDetailQueryMock.mockReturnValue(query({ data: { data: NOTICE } }));
    renderDetail('..%2f..%2fadmin');
    expect(screen.getByText('This announcement is no longer available.')).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('does not mark an already-read notice', () => {
    useDetailQueryMock.mockReturnValue(
      query({ data: { data: { ...NOTICE, readAt: '2026-11-01T00:00:00Z' } } }),
    );
    renderDetail();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('renders the notice content with a critical chip and full date', () => {
    useDetailQueryMock.mockReturnValue(query({ data: { data: NOTICE } }));
    renderDetail();
    expect(screen.getByRole('heading', { name: 'Road closure' })).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByText('Tue 10 Nov, 9:30 am')).toBeInTheDocument();
  });

  it('shows a friendly 404 with a back action', () => {
    useDetailQueryMock.mockReturnValue(
      query({ isError: true, error: new ApiError(404, 'gone', 'NOT_FOUND') }),
    );
    renderDetail();
    expect(screen.getByText('This announcement is no longer available.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to announcements' })).toBeInTheDocument();
    expect(mutate).not.toHaveBeenCalled();
  });

  it('shows a retryable error for a non-404 failure', () => {
    useDetailQueryMock.mockReturnValue(
      query({ isError: true, error: new ApiError(500, 'boom', 'SERVER') }),
    );
    renderDetail();
    expect(screen.getByText("Couldn't load this announcement.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });
});
