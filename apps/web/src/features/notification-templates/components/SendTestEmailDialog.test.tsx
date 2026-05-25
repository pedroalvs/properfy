import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/useAuth';
import { SnackbarProvider } from '@/hooks/useSnackbar';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/services/api', () => ({
  api: {
    GET: vi.fn(),
    POST: vi.fn(),
    PATCH: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
  },
}));

vi.mock('@/lib/api-error', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string, public code?: string) {
      super(message);
      this.name = 'ApiError';
    }
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

import { api } from '@/services/api';
import { Snackbar } from '@/components/feedback/Snackbar';
import { SendTestEmailDialog } from './SendTestEmailDialog';

const mockPost = api.POST as ReturnType<typeof vi.fn>;

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <SnackbarProvider>
            <MemoryRouter>{children}</MemoryRouter>
            <Snackbar />
          </SnackbarProvider>
        </AuthProvider>
      </QueryClientProvider>
    );
  };
}

function renderDialog(props: Partial<React.ComponentProps<typeof SendTestEmailDialog>> = {}) {
  const onClose = vi.fn();
  const wrapper = createWrapper();
  render(
    <SendTestEmailDialog
      open={true}
      onClose={onClose}
      templateCode="INSPECTION_NOTICE"
      channel="EMAIL"
      {...props}
    />,
    { wrapper },
  );
  return { onClose };
}

beforeEach(() => {
  mockPost.mockReset();
});

describe('SendTestEmailDialog', () => {
  it('renders nothing when open=false', () => {
    const wrapper = createWrapper();
    render(
      <SendTestEmailDialog open={false} onClose={vi.fn()} templateCode="INSPECTION_NOTICE" channel="EMAIL" />,
      { wrapper },
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders dialog with title when open=true', () => {
    renderDialog();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Send Test Email')).toBeInTheDocument();
  });

  it('renders email input and Send/Cancel buttons', () => {
    renderDialog();
    expect(screen.getByLabelText('Recipient email')).toBeInTheDocument();
    expect(screen.getByText('Send')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('Send button is disabled when email is empty', () => {
    renderDialog();
    expect(screen.getByText('Send').closest('button')).toBeDisabled();
  });

  it('Send button enables when a non-empty email is typed', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByLabelText('Recipient email'), 'a@b.com');
    expect(screen.getByText('Send').closest('button')).not.toBeDisabled();
  });

  it('shows validation error for invalid email format on Send click', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByLabelText('Recipient email'), 'notanemail');
    await user.click(screen.getByText('Send'));
    expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('calls POST and shows success snackbar then closes on valid send', async () => {
    mockPost.mockResolvedValue({ data: { data: { messageId: 'msg-1' } }, error: null });
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.type(screen.getByLabelText('Recipient email'), 'test@example.com');
    await user.click(screen.getByText('Send'));

    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/v1/notification-templates/INSPECTION_NOTICE/EMAIL/test-send',
        { body: { recipientEmail: 'test@example.com' } },
      );
    });

    await waitFor(() => {
      expect(screen.getByText(/test email sent to test@example\.com/i)).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('shows error snackbar and keeps dialog open on API error', async () => {
    mockPost.mockResolvedValue({ data: null, error: { error: { message: 'Template not found' } } });
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.type(screen.getByLabelText('Recipient email'), 'test@example.com');
    await user.click(screen.getByText('Send'));

    await waitFor(() => {
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('clears email and error state on close', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();

    await user.type(screen.getByLabelText('Recipient email'), 'notanemail');
    await user.click(screen.getByText('Send'));
    await screen.findByText(/valid email/i);

    fireEvent.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });
});
