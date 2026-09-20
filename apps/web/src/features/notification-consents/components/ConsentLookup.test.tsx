import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from '@/hooks/useSnackbar';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/services/api', () => ({
  api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), PUT: vi.fn(), DELETE: vi.fn() },
}));

const mockHasRole = vi.fn();
vi.mock('@/hooks/usePermissions', () => ({
  usePermissions: () => ({ hasRole: mockHasRole }),
}));

const mockConsentLookup = vi.fn();
vi.mock('../hooks/useConsentLookup', () => ({
  useConsentLookup: (args: { recipient: string | null }) => mockConsentLookup(args),
}));

vi.mock('./ConsentOverrideModal', () => ({
  ConsentOverrideModal: ({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) => (
    <div data-testid="consent-override-modal">
      <button onClick={onSuccess}>Confirm override</button>
      <button onClick={onClose}>Cancel</button>
    </div>
  ),
}));

import { ConsentLookup } from './ConsentLookup';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <SnackbarProvider>{children}</SnackbarProvider>
      </QueryClientProvider>
    );
  };
}

function idleHookResult() {
  return { data: null, isLoading: false, isError: false, error: null, refetch: vi.fn() };
}

function submitRecipient(value: string) {
  fireEvent.change(screen.getByLabelText(/recipient/i), { target: { value } });
  fireEvent.submit(screen.getByRole('button', { name: /search/i }).closest('form')!);
}

describe('ConsentLookup (feature 018 T075)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasRole.mockReturnValue(true);
    mockConsentLookup.mockReturnValue(idleHookResult());
  });

  it('shows permission-denied banner for non-AM/OP users', () => {
    mockHasRole.mockReturnValue(false);
    render(<ConsentLookup />, { wrapper: createWrapper() });

    expect(screen.getByText(/you do not have permission/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/email or phone/i)).not.toBeInTheDocument();
  });

  // WI-11 (#347): explicit pre-search prompt, no table and no fetch before searching.
  it('renders a pre-search prompt (no table) before any recipient is searched', () => {
    render(<ConsentLookup />, { wrapper: createWrapper() });

    expect(screen.getByText(/enter a recipient to search/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    // The hook is called with a null recipient, so it stays disabled (no fetch).
    expect(mockConsentLookup).toHaveBeenLastCalledWith({ recipient: null });
  });

  it('renders search form and disables Search when input is empty', () => {
    render(<ConsentLookup />, { wrapper: createWrapper() });
    expect(screen.getByLabelText(/recipient/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /search/i })).toBeDisabled();
  });

  it('enables Search when input has text', () => {
    render(<ConsentLookup />, { wrapper: createWrapper() });
    fireEvent.change(screen.getByLabelText(/recipient/i), { target: { value: 'alice@example.com' } });
    expect(screen.getByRole('button', { name: /search/i })).not.toBeDisabled();
  });

  it('calls useConsentLookup with the submitted recipient', async () => {
    render(<ConsentLookup />, { wrapper: createWrapper() });
    submitRecipient('alice@example.com');
    await waitFor(() => {
      expect(mockConsentLookup.mock.calls.at(-1)![0].recipient).toBe('alice@example.com');
    });
  });

  it('shows the DataTable loading state while the hook is loading', async () => {
    mockConsentLookup.mockReturnValue({ ...idleHookResult(), isLoading: true });
    render(<ConsentLookup />, { wrapper: createWrapper() });
    submitRecipient('alice@example.com');
    await waitFor(() => {
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.queryByText(/enter a recipient to search/i)).not.toBeInTheDocument();
    });
  });

  it('shows an error message when the hook returns isError', async () => {
    mockConsentLookup.mockReturnValue({
      ...idleHookResult(),
      isError: true,
      error: { message: 'Network error' },
    });
    render(<ConsentLookup />, { wrapper: createWrapper() });
    submitRecipient('alice@example.com');
    await waitFor(() => {
      expect(screen.getByText(/failed to load consents/i)).toBeInTheDocument();
    });
  });

  it('renders Opted In / Opted Out chips, recipient and skipped count in the results table', async () => {
    mockConsentLookup.mockReturnValue({
      ...idleHookResult(),
      data: {
        recipient: 'alice@example.com',
        skippedCount: 2,
        entries: [
          { id: 'e1', channel: 'EMAIL', notificationClass: 'REMINDER', optedOut: false, changeSource: 'USER', changedAt: '2026-01-01T10:00:00Z' },
          { id: 'e2', channel: 'SMS', notificationClass: 'MARKETING', optedOut: true, changeSource: 'OPERATOR', changedAt: '2026-02-01T10:00:00Z' },
        ],
      },
    });
    render(<ConsentLookup />, { wrapper: createWrapper() });
    submitRecipient('alice@example.com');
    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument();
      expect(screen.getByText('Opted In')).toBeInTheDocument();
      expect(screen.getByText('Opted Out')).toBeInTheDocument();
      expect(screen.getByText('alice@example.com')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
    });
  });

  it('shows the empty state when there are no consent records', async () => {
    mockConsentLookup.mockReturnValue({
      ...idleHookResult(),
      data: { recipient: 'unknown@example.com', skippedCount: 0, entries: [] },
    });
    render(<ConsentLookup />, { wrapper: createWrapper() });
    submitRecipient('unknown@example.com');
    await waitFor(() => {
      expect(screen.getByText(/no consent records/i)).toBeInTheDocument();
    });
  });

  it('shows the Override action only for opted-out rows', async () => {
    mockConsentLookup.mockReturnValue({
      ...idleHookResult(),
      data: {
        recipient: 'alice@example.com',
        skippedCount: 0,
        entries: [
          { id: 'e1', channel: 'EMAIL', notificationClass: 'REMINDER', optedOut: false, changeSource: null, changedAt: null },
          { id: 'e2', channel: 'SMS', notificationClass: 'MARKETING', optedOut: true, changeSource: null, changedAt: null },
        ],
      },
    });
    render(<ConsentLookup />, { wrapper: createWrapper() });
    submitRecipient('alice@example.com');
    await waitFor(() => screen.getByRole('button', { name: /override/i }));
    expect(screen.getAllByRole('button', { name: /override/i })).toHaveLength(1);
  });

  it('opens the override modal; onSuccess closes it and refetches', async () => {
    const refetch = vi.fn();
    mockConsentLookup.mockReturnValue({
      ...idleHookResult(),
      refetch,
      data: {
        recipient: 'alice@example.com',
        skippedCount: 0,
        entries: [
          { id: 'e2', channel: 'SMS', notificationClass: 'MARKETING', optedOut: true, changeSource: null, changedAt: null },
        ],
      },
    });
    render(<ConsentLookup />, { wrapper: createWrapper() });
    submitRecipient('alice@example.com');

    await waitFor(() => screen.getByRole('button', { name: /override/i }));
    fireEvent.click(screen.getByRole('button', { name: /override/i }));

    await waitFor(() => screen.getByTestId('consent-override-modal'));
    fireEvent.click(screen.getByRole('button', { name: /confirm override/i }));

    await waitFor(() => {
      expect(screen.queryByTestId('consent-override-modal')).not.toBeInTheDocument();
      expect(refetch).toHaveBeenCalledOnce();
    });
  });
});
