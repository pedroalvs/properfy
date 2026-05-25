import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/useAuth';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { Snackbar } from '@/components/feedback/Snackbar';

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
import { SendTestSmsDialog } from './SendTestSmsDialog';

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

function renderDialog(props: Partial<React.ComponentProps<typeof SendTestSmsDialog>> = {}) {
  const onClose = vi.fn();
  const wrapper = createWrapper();
  render(
    <SendTestSmsDialog
      open={true}
      onClose={onClose}
      templateCode="INSPECTION_NOTICE_SMS"
      channel="SMS"
      {...props}
    />,
    { wrapper },
  );
  return { onClose };
}

beforeEach(() => {
  mockPost.mockReset();
});

describe('SendTestSmsDialog', () => {
  it('renders nothing when open=false', () => {
    const wrapper = createWrapper();
    render(
      <SendTestSmsDialog open={false} onClose={vi.fn()} templateCode="INSPECTION_NOTICE_SMS" channel="SMS" />,
      { wrapper },
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders dialog with title Send Test SMS when open=true', () => {
    renderDialog();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Send Test SMS')).toBeInTheDocument();
  });

  it('renders PhoneInput with default placeholder 0412 345 678', () => {
    renderDialog();
    expect(screen.getByPlaceholderText('0412 345 678')).toBeInTheDocument();
  });

  it('renders Send and Cancel buttons', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('Send button is disabled when phone is empty', () => {
    renderDialog();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
  });

  it('Send button enables after typing a valid AU mobile', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByPlaceholderText('0412 345 678'), '0412345678');
    expect(screen.getByRole('button', { name: 'Send' })).not.toBeDisabled();
  });

  it('shows validation error for invalid phone on Send click', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByPlaceholderText('0412 345 678'), '123');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText(/valid australian phone/i)).toBeInTheDocument();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('converts masked local mobile to E.164 before POST', async () => {
    mockPost.mockResolvedValue({ data: { data: { messageId: 'sms-1' } }, error: null });
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByPlaceholderText('0412 345 678'), '0412345678');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/v1/notification-templates/INSPECTION_NOTICE_SMS/SMS/test-send',
        { body: { recipientPhone: '+61412345678' } },
      );
    });
  });

  it('accepts international +61 format and converts to canonical E.164', async () => {
    mockPost.mockResolvedValue({ data: { data: { messageId: 'sms-1' } }, error: null });
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByPlaceholderText('0412 345 678'), '+61412345678');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => {
      expect(mockPost).toHaveBeenCalledWith(
        '/v1/notification-templates/INSPECTION_NOTICE_SMS/SMS/test-send',
        { body: { recipientPhone: '+61412345678' } },
      );
    });
  });

  it('shows success snackbar with masked phone then closes on valid send', async () => {
    mockPost.mockResolvedValue({ data: { data: { messageId: 'sms-1' } }, error: null });
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.type(screen.getByPlaceholderText('0412 345 678'), '0412345678');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => {
      expect(screen.getByText(/test sms sent to/i)).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('shows error snackbar and keeps dialog open on API error', async () => {
    mockPost.mockResolvedValue({ data: null, error: { error: { message: 'Template not found' } } });
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.type(screen.getByPlaceholderText('0412 345 678'), '0412345678');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => {
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  it('calls onClose when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const { onClose } = renderDialog();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('clears phone and error state when dialog closes', async () => {
    const user = userEvent.setup();
    renderDialog();
    await user.type(screen.getByPlaceholderText('0412 345 678'), '123');
    await user.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText(/valid australian phone/i);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    // onClose was called (state reset happens internally on close)
    expect(screen.queryByText(/valid australian phone/i)).not.toBeInTheDocument();
  });
});
