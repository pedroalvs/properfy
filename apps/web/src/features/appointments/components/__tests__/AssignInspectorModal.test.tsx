import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockShowSuccess = vi.fn();
const mockShowError = vi.fn();

vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess: mockShowSuccess, showError: mockShowError, showInfo: vi.fn() }),
  SnackbarProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

const mockApiGet = vi.fn();
const mockApiPost = vi.fn();

vi.mock('@/services/api', () => ({
  api: {
    GET: (...args: unknown[]) => mockApiGet(...args),
    POST: (...args: unknown[]) => mockApiPost(...args),
  },
}));

vi.mock('@/lib/auth-storage', () => ({
  authStorage: {
    getAccessToken: vi.fn(() => null),
    hasTokens: vi.fn(() => false),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
  },
}));

import { AssignInspectorModal } from '../AssignInspectorModal';

const INSPECTORS = [
  { id: 'insp-1', name: 'Alice Smith', email: 'alice@example.com' },
  { id: 'insp-2', name: 'Bob Jones', email: 'bob@example.com' },
];

function renderModal(props: Partial<React.ComponentProps<typeof AssignInspectorModal>> = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const defaults = {
    open: true,
    appointmentId: 'apt-1',
    onClose: vi.fn(),
    onSuccess: vi.fn(),
  };
  return render(
    <QueryClientProvider client={queryClient}>
      <AssignInspectorModal {...defaults} {...props} />
    </QueryClientProvider>,
  );
}

describe('AssignInspectorModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiGet.mockResolvedValue({ data: { data: INSPECTORS }, error: null });
    mockApiPost.mockResolvedValue({ data: {}, error: null });
    mockShowSuccess.mockClear();
    mockShowError.mockClear();
  });

  it('renders the modal title', async () => {
    renderModal();
    expect(screen.getByText('Assign Inspector')).toBeInTheDocument();
  });

  it('shows inspector list after loading', async () => {
    renderModal();
    await waitFor(() => expect(screen.getByTestId('inspector-list')).toBeInTheDocument());
    expect(await screen.findByText('Alice Smith')).toBeInTheDocument();
    expect(await screen.findByText('Bob Jones')).toBeInTheDocument();
  });

  it('Assign button is disabled when no inspector selected', async () => {
    renderModal();
    await screen.findByText('Alice Smith');
    expect(screen.getByTestId('assign-confirm-button')).toBeDisabled();
  });

  it('enables Assign button after selecting an inspector', async () => {
    renderModal();
    await screen.findByText('Alice Smith');
    fireEvent.click(screen.getByTestId('inspector-row-insp-1'));
    expect(screen.getByTestId('assign-confirm-button')).not.toBeDisabled();
  });

  it('calls POST status-transition with SCHEDULED and inspectorId on confirm', async () => {
    const onSuccess = vi.fn();
    renderModal({ onSuccess });
    await screen.findByText('Alice Smith');
    fireEvent.click(screen.getByTestId('inspector-row-insp-1'));
    fireEvent.click(screen.getByTestId('assign-confirm-button'));
    await waitFor(() => expect(mockApiPost).toHaveBeenCalledWith(
      '/v1/appointments/apt-1/status-transitions',
      expect.objectContaining({
        body: expect.objectContaining({ targetStatus: 'SCHEDULED', inspectorId: 'insp-1' }),
      }),
    ));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('calls showError when POST fails', async () => {
    mockApiPost.mockResolvedValue({ data: null, error: { error: { message: 'Assignment failed' } } });
    renderModal();
    await screen.findByText('Alice Smith');
    fireEvent.click(screen.getByTestId('inspector-row-insp-1'));
    fireEvent.click(screen.getByTestId('assign-confirm-button'));
    await waitFor(() => expect(mockShowError).toHaveBeenCalledWith('Assignment failed'));
  });

  it('does not render when closed', () => {
    renderModal({ open: false });
    expect(screen.queryByText('Assign Inspector')).not.toBeInTheDocument();
  });

  it('shows search input', async () => {
    renderModal();
    expect(screen.getByTestId('inspector-search-input')).toBeInTheDocument();
  });

  it('shows empty state when no inspectors found', async () => {
    mockApiGet.mockResolvedValue({ data: { data: [] }, error: null });
    renderModal();
    await waitFor(() => expect(screen.getByText('No active inspectors found.')).toBeInTheDocument());
  });
});
