import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/services/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }));

const showSuccess = vi.fn();
const showError = vi.fn();
vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess, showError, showInfo: vi.fn(), dismiss: vi.fn() }),
  SnackbarProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import { api } from '@/services/api';
import { InspectorNoticeDetailPage } from './InspectorNoticeDetailPage';

const mockGet = api.GET as ReturnType<typeof vi.fn>;
const mockPost = api.POST as ReturnType<typeof vi.fn>;

type Recipient = {
  inspectorId: string;
  inspectorName: string;
  readAt: string | null;
  inspectorStatus: 'ACTIVE' | 'INACTIVE';
  hasAppAccess: boolean;
};

function detail(overrides: Record<string, unknown> = {}, recipients?: Recipient[]) {
  const recs: Recipient[] =
    recipients ??
    [
      { inspectorId: '1', inspectorName: 'Ana', readAt: '2026-11-10T23:00:00Z', inspectorStatus: 'ACTIVE', hasAppAccess: true },
      { inspectorId: '2', inspectorName: 'Bob', readAt: null, inspectorStatus: 'ACTIVE', hasAppAccess: true },
    ];
  return {
    data: {
      data: {
        id: 'n1',
        title: 'Road closure',
        body: 'Line one\nLine two',
        critical: true,
        audience: { type: 'ALL' },
        author: { type: 'USER', name: 'Ana Op' },
        publishedAt: '2026-11-10T22:30:00Z',
        archivedAt: null,
        recipientCount: recs.length,
        readCount: recs.filter((r) => r.readAt).length,
        recipients: recs,
        ...overrides,
      },
    },
  };
}

function renderDetail() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  render(
    <MemoryRouter initialEntries={['/inspector-notices/n1']}>
      <QueryClientProvider client={qc}>
        <Routes>
          <Route path="/inspector-notices" element={<div>LIST PAGE</div>} />
          <Route path="/inspector-notices/:noticeId" element={<InspectorNoticeDetailPage />} />
        </Routes>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockGet.mockReset();
  mockPost.mockReset();
  showSuccess.mockClear();
  showError.mockClear();
});

describe('InspectorNoticeDetailPage', () => {
  it('shows the header, chips, meta, pre-wrapped body and read tally', async () => {
    mockGet.mockResolvedValue(detail());
    renderDetail();
    expect(await screen.findByRole('heading', { name: 'Road closure' })).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
    expect(screen.getByText('By Ana Op')).toBeInTheDocument();
    expect(screen.getByText('Audience: All active inspectors')).toBeInTheDocument();
    expect(screen.getByText(/Line one/)).toBeInTheDocument();
    expect(screen.getByText('Read by 1 of 2')).toBeInTheDocument();
    const bar = screen.getByRole('progressbar', { name: 'Read progress' });
    expect(bar).toHaveAttribute('aria-valuenow', '1');
    expect(bar).toHaveAttribute('aria-valuemax', '2');
  });

  it('Back returns to the list on direct entry', async () => {
    mockGet.mockResolvedValue(detail());
    renderDetail();
    await screen.findByRole('heading', { name: 'Road closure' });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByText('LIST PAGE')).toBeInTheDocument();
  });

  it('does not interpret HTML in the body', async () => {
    mockGet.mockResolvedValue(detail({ body: '<b>bold</b>' }));
    renderDetail();
    expect(await screen.findByText('<b>bold</b>')).toBeInTheDocument();
  });

  it('shows the "can\'t read in the app" tally and the muted chips (L-F02-09)', async () => {
    const recipients: Recipient[] = [
      { inspectorId: '1', inspectorName: 'A', readAt: '2026-11-10T23:00:00Z', inspectorStatus: 'ACTIVE', hasAppAccess: true },
      { inspectorId: '2', inspectorName: 'B', readAt: '2026-11-10T23:00:00Z', inspectorStatus: 'ACTIVE', hasAppAccess: true },
      { inspectorId: '3', inspectorName: 'C', readAt: '2026-11-10T23:00:00Z', inspectorStatus: 'ACTIVE', hasAppAccess: true },
      { inspectorId: '4', inspectorName: 'D', readAt: null, inspectorStatus: 'INACTIVE', hasAppAccess: true },
      { inspectorId: '5', inspectorName: 'E', readAt: null, inspectorStatus: 'ACTIVE', hasAppAccess: false },
      { inspectorId: '6', inspectorName: 'F', readAt: null, inspectorStatus: 'ACTIVE', hasAppAccess: true },
    ];
    mockGet.mockResolvedValue(detail({ recipientCount: 10, readCount: 3 }, recipients));
    renderDetail();
    expect(await screen.findByText("Read by 3 of 10 (2 can't read in the app)")).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
    expect(screen.getByText('No app access')).toBeInTheDocument();
  });

  it('a read inactive recipient keeps the chip but is not counted as unable to read', async () => {
    const recipients: Recipient[] = [
      { inspectorId: '1', inspectorName: 'A', readAt: '2026-11-10T23:00:00Z', inspectorStatus: 'INACTIVE', hasAppAccess: true },
      { inspectorId: '2', inspectorName: 'B', readAt: '2026-11-10T23:00:00Z', inspectorStatus: 'ACTIVE', hasAppAccess: true },
    ];
    mockGet.mockResolvedValue(detail({ recipientCount: 2, readCount: 2 }, recipients));
    renderDetail();
    expect(await screen.findByText('Read by 2 of 2')).toBeInTheDocument();
    expect(screen.getByText('Inactive')).toBeInTheDocument();
  });

  it('filters recipients by the Read/Unread tabs', async () => {
    const recipients: Recipient[] = [
      { inspectorId: '1', inspectorName: 'ReadOne', readAt: '2026-11-10T23:00:00Z', inspectorStatus: 'ACTIVE', hasAppAccess: true },
      { inspectorId: '2', inspectorName: 'UnreadOne', readAt: null, inspectorStatus: 'ACTIVE', hasAppAccess: true },
    ];
    mockGet.mockResolvedValue(detail({ recipientCount: 2, readCount: 1 }, recipients));
    renderDetail();
    await screen.findByText('ReadOne');
    fireEvent.click(screen.getByRole('tab', { name: 'Unread (1)' }));
    await waitFor(() => expect(screen.queryByText('ReadOne')).not.toBeInTheDocument());
    expect(screen.getByText('UnreadOne')).toBeInTheDocument();
  });

  it('archives with confirmation then shows the archived banner', async () => {
    mockGet.mockResolvedValueOnce(detail());
    mockGet.mockResolvedValue(detail({ archivedAt: '2026-11-11T00:00:00Z' }));
    mockPost.mockResolvedValue({ data: {} });
    renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: /Archive/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Archive this notice?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/v1/inspector-notices/{noticeId}/archive', { params: { path: { noticeId: 'n1' } } }));
    expect(showSuccess).toHaveBeenCalledWith('Notice archived');
    expect(await screen.findByText('This notice is archived. Inspectors no longer see it.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Archive$/ })).not.toBeInTheDocument();
  });

  it('surfaces an error and closes the dialog when archive fails', async () => {
    mockGet.mockResolvedValue(detail());
    mockPost.mockResolvedValue({ error: { error: { code: 'BOOM', message: 'x' } }, response: { status: 500 } });
    renderDetail();
    fireEvent.click(await screen.findByRole('button', { name: /Archive/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Archive this notice?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(showError).toHaveBeenCalledWith("Couldn't archive the notice. Try again."));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Archive this notice?' })).not.toBeInTheDocument());
    expect(showSuccess).not.toHaveBeenCalled();
  });

  it('hides the Archive action for an already-archived notice', async () => {
    mockGet.mockResolvedValue(detail({ archivedAt: '2026-11-11T00:00:00Z' }));
    renderDetail();
    await screen.findByRole('heading', { name: 'Road closure' });
    expect(screen.queryByRole('button', { name: /Archive/ })).not.toBeInTheDocument();
  });

  it('shows a not-found state for a 404', async () => {
    mockGet.mockResolvedValue({ error: { error: { code: 'INSPECTOR_NOTICE_NOT_FOUND', message: 'nope' } }, response: { status: 404 } });
    renderDetail();
    expect(await screen.findByText('Notice not found')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to notices' })).toBeInTheDocument();
  });

  it('shows an error state with Retry', async () => {
    mockGet.mockResolvedValue({ error: { error: { code: 'X', message: 'x' } }, response: { status: 500 } });
    renderDetail();
    expect(await screen.findByText("Couldn't load this notice.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });
});
