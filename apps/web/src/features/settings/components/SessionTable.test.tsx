import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from '@/hooks/useSnackbar';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/services/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

import { api } from '@/services/api';
import { SessionTable } from './SessionTable';

const mockGet = api.GET as ReturnType<typeof vi.fn>;

const MOCK_SESSIONS = [
  { id: 'sess-01', userAgent: 'Chrome/120', ipAddress: '192.168.1.1', lastActiveAt: '2026-03-17T10:00:00Z', createdAt: '2026-03-16T10:00:00Z', isCurrent: true },
  { id: 'sess-02', userAgent: 'Safari/17', ipAddress: '10.0.0.1', lastActiveAt: '2026-03-16T08:00:00Z', createdAt: '2026-03-15T10:00:00Z', isCurrent: false },
];

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}><SnackbarProvider>{children}</SnackbarProvider></QueryClientProvider>;
  };
}

beforeEach(() => {
  mockGet.mockReset();
  mockGet.mockResolvedValue({ data: { data: MOCK_SESSIONS } });
});

describe('SessionTable', () => {
  it('renders title', () => {
    const Wrapper = createWrapper();
    render(<Wrapper><SessionTable /></Wrapper>);
    expect(screen.getByText('Active Sessions')).toBeInTheDocument();
    expect(screen.getByText('Started At')).toBeInTheDocument();
  });

  it('renders session data after loading', async () => {
    const Wrapper = createWrapper();
    render(<Wrapper><SessionTable /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByText('Chrome/120')).toBeInTheDocument();
      expect(screen.getByText('Safari/17')).toBeInTheDocument();
    });
  });

  it('marks current session', async () => {
    const Wrapper = createWrapper();
    render(<Wrapper><SessionTable /></Wrapper>);
    await waitFor(() => {
      expect(screen.getByText('Current')).toBeInTheDocument();
    });
  });
});
