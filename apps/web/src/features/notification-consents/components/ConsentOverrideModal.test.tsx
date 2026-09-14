import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConsentOverrideModal } from './ConsentOverrideModal';
import { api } from '@/services/api';
import type { ConsentRecord } from '../hooks/useConsentLookup';

vi.mock('@/services/api', () => ({
  api: {
    POST: vi.fn().mockResolvedValue({ data: { data: {} }, error: null }),
  },
}));

const mockConsent: ConsentRecord = {
  id: '00000000-0000-0000-0000-000000000001',
  recipient: 'user@example.com',
  channel: 'EMAIL',
  tenantId: 'tenant-1',
  notificationClass: 'OPERATIONAL',
  optedOut: true,
  optedOutAt: '2026-04-01T00:00:00Z',
  changeSource: 'operator_override',
  changedAt: '2026-04-01T00:00:00Z',
  changedByUserId: null,
  reason: null,
  createdAt: '2026-04-01T00:00:00Z',
  updatedAt: '2026-04-01T00:00:00Z',
};

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('ConsentOverrideModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.POST).mockResolvedValue({ data: { data: {} }, error: null } as never);
  });

  it('renders recipient, channel and class metadata', () => {
    renderWithClient(
      <ConsentOverrideModal consent={mockConsent} onClose={vi.fn()} onSuccess={vi.fn()} />,
    );
    expect(screen.getByText(/user@example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/EMAIL/)).toBeInTheDocument();
    expect(screen.getByText(/OPERATIONAL/)).toBeInTheDocument();
  });

  // WI-12 (#374): accessibility comes from the Dialog primitive.
  it('is an accessible dialog labelled by its title, with focus moved inside', () => {
    renderWithClient(
      <ConsentOverrideModal consent={mockConsent} onClose={vi.fn()} onSuccess={vi.fn()} />,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName('Override Opt-Out');
    // Focus trap: the primitive moves focus into the dialog on open.
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('disables submit when reason is empty', () => {
    renderWithClient(
      <ConsentOverrideModal consent={mockConsent} onClose={vi.fn()} onSuccess={vi.fn()} />,
    );
    expect(screen.getByRole('button', { name: /Confirm Override/ })).toBeDisabled();
  });

  it('enables submit once a reason is entered', () => {
    renderWithClient(
      <ConsentOverrideModal consent={mockConsent} onClose={vi.fn()} onSuccess={vi.fn()} />,
    );
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Customer called' } });
    expect(screen.getByRole('button', { name: /Confirm Override/ })).not.toBeDisabled();
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    renderWithClient(
      <ConsentOverrideModal consent={mockConsent} onClose={onClose} onSuccess={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  // WI-12 (#716): the submit path.
  it('POSTs the consent id and reason, then calls onSuccess', async () => {
    const onSuccess = vi.fn();
    renderWithClient(
      <ConsentOverrideModal consent={mockConsent} onClose={vi.fn()} onSuccess={onSuccess} />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Customer called in' } });
    // Click the real footer button (not fireEvent.submit on the form): this is the
    // wiring that ships — the Confirm button lives in Dialog's actions and submits
    // the form via requestSubmit(), so a broken button would fail here.
    fireEvent.click(screen.getByRole('button', { name: /Confirm Override/ }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(api.POST).toHaveBeenCalledWith(
      '/v1/notifications/consents/{consentId}/override',
      expect.objectContaining({
        params: { path: { consentId: mockConsent.id } },
        body: { reason: 'Customer called in' },
      }),
    );
  });

  it('surfaces the error and does NOT call onSuccess when the override fails', async () => {
    vi.mocked(api.POST).mockResolvedValueOnce({
      data: undefined,
      error: { status: 409, error: { message: 'Already opted in' } },
    } as never);
    const onSuccess = vi.fn();
    renderWithClient(
      <ConsentOverrideModal consent={mockConsent} onClose={vi.fn()} onSuccess={onSuccess} />,
    );

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Customer called in' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirm Override/ }));

    await waitFor(() => expect(screen.getByText(/Already opted in/)).toBeInTheDocument());
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
