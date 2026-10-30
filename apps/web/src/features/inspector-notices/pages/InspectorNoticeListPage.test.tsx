import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { SnackbarProvider } from '@/hooks/useSnackbar';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/services/api', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }));

import { api } from '@/services/api';
import { InspectorNoticeListPage } from './InspectorNoticeListPage';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

function row(overrides = {}) {
  return {
    id: 'n1',
    title: 'Road closure',
    body: 'x',
    critical: true,
    audience: { type: 'ALL' },
    author: { type: 'USER', name: 'Ana Op' },
    publishedAt: '2026-11-10T22:30:00Z',
    archivedAt: null,
    recipientCount: 10,
    readCount: 3,
    ...overrides,
  };
}

function listResponse(data: unknown[]) {
  return { data: { data, pagination: { page: 1, pageSize: 20, total: data.length, totalPages: 1 } } };
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <MemoryRouter initialEntries={['/inspector-notices']}>
      <QueryClientProvider client={qc}>
        <SnackbarProvider>
          <Routes>
            <Route path="/inspector-notices" element={<InspectorNoticeListPage />} />
            <Route path="/inspector-notices/:noticeId" element={<div>DETAIL PAGE</div>} />
          </Routes>
        </SnackbarProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mockGet.mockReset();
});

describe('InspectorNoticeListPage', () => {
  it('renders notice rows', async () => {
    mockGet.mockResolvedValue(listResponse([row()]));
    renderPage();
    expect(await screen.findByText('Road closure')).toBeInTheDocument();
    // "All active inspectors" also appears as a (hidden) drawer radio label, so scope to the table.
    expect(within(screen.getByRole('table')).getByText('All active inspectors')).toBeInTheDocument();
    expect(screen.getByText('3/10')).toBeInTheDocument();
  });

  it('refetches with status=archived when the Archived filter is chosen', async () => {
    mockGet.mockResolvedValue(listResponse([row()]));
    renderPage();
    await screen.findByText('Road closure');
    mockGet.mockClear();
    fireEvent.click(screen.getByRole('tab', { name: 'Archived' }));
    await waitFor(() =>
      expect(mockGet).toHaveBeenCalledWith('/v1/inspector-notices', {
        params: { query: expect.objectContaining({ status: 'archived', page: '1' }) },
      }),
    );
  });

  it('shows an empty state with a New notice CTA for active', async () => {
    mockGet.mockResolvedValue(listResponse([]));
    renderPage();
    expect(await screen.findByText('No notices yet')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /New notice/ }).length).toBeGreaterThanOrEqual(1);
  });

  it('shows the archived empty state', async () => {
    mockGet.mockResolvedValue(listResponse([]));
    renderPage();
    await screen.findByText('No notices yet');
    fireEvent.click(screen.getByRole('tab', { name: 'Archived' }));
    expect(await screen.findByText('No archived notices')).toBeInTheDocument();
  });

  it('shows an error state with Retry that refetches', async () => {
    mockGet.mockResolvedValue({ error: { error: { code: 'X', message: 'x' } }, response: { status: 500 } });
    renderPage();
    expect(await screen.findByText("Couldn't load notices.")).toBeInTheDocument();
    mockGet.mockClear();
    mockGet.mockResolvedValue(listResponse([row()]));
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText('Road closure')).toBeInTheDocument();
  });

  it('navigates to the detail when a row is opened', async () => {
    mockGet.mockResolvedValue(listResponse([row({ title: 'Road closure' })]));
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Open notice Road closure' }));
    expect(await screen.findByText('DETAIL PAGE')).toBeInTheDocument();
  });
});
