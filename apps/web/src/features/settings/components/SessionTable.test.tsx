import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
const mockDelete = api.DELETE as ReturnType<typeof vi.fn>;

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
  mockDelete.mockReset();
  mockGet.mockResolvedValue({ data: { data: MOCK_SESSIONS } });
  mockDelete.mockResolvedValue({ data: undefined, error: undefined });
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

  it('revokes a non-current session and refreshes the list', async () => {
    const evt = userEvent.setup();
    const Wrapper = createWrapper();
    render(<Wrapper><SessionTable /></Wrapper>);

    await waitFor(() => {
      expect(screen.getByText('Safari/17')).toBeInTheDocument();
    });

    // Only the non-current session (Safari/17) has a Revoke action.
    const [revokeButton, ...restRevokeButtons] = screen.getAllByRole('button', { name: 'Revoke' });
    expect(restRevokeButtons).toHaveLength(0);
    if (!revokeButton) throw new Error('Expected to find a Revoke button');
    await evt.click(revokeButton);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Revoke session?')).toBeInTheDocument();

    const initialGetCalls = mockGet.mock.calls.length;
    await evt.click(within(dialog).getByRole('button', { name: 'Revoke' }));

    await waitFor(() => {
      expect(mockDelete).toHaveBeenCalledWith('/v1/auth/sessions/sess-02', expect.anything());
    });

    // The query for ['sessions'] is invalidated, triggering a refetch of the list.
    await waitFor(() => {
      expect(mockGet.mock.calls.length).toBeGreaterThan(initialGetCalls);
    });
  });

  it('offers no Revoke action for the current session', async () => {
    const Wrapper = createWrapper();
    render(<Wrapper><SessionTable /></Wrapper>);

    await waitFor(() => {
      expect(screen.getByText('Chrome/120')).toBeInTheDocument();
    });

    // Exactly one Revoke action exists in the whole table — for the non-current session.
    const revokeButtons = screen.getAllByRole('button', { name: 'Revoke' });
    expect(revokeButtons).toHaveLength(1);

    // The current-session row (Chrome/120) has no Revoke button next to it.
    const currentRow = screen.getByText('Chrome/120').closest('tr');
    if (!currentRow) throw new Error('Expected to find the current session row');
    expect(within(currentRow).queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument();
  });
});
