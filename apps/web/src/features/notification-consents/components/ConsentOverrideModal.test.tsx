import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConsentOverrideModal } from './ConsentOverrideModal';
import type { ConsentRecord } from '../hooks/useConsentLookup';

// Mock the API client
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
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('ConsentOverrideModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders recipient, channel and class metadata', () => {
    renderWithClient(
      <ConsentOverrideModal consent={mockConsent} onClose={vi.fn()} onSuccess={vi.fn()} />,
    );
    expect(screen.getByText(/user@example\.com/)).toBeInTheDocument();
    expect(screen.getByText(/EMAIL/)).toBeInTheDocument();
    expect(screen.getByText(/OPERATIONAL/)).toBeInTheDocument();
  });

  it('disables submit when reason is empty', () => {
    renderWithClient(
      <ConsentOverrideModal consent={mockConsent} onClose={vi.fn()} onSuccess={vi.fn()} />,
    );
    const submitButton = screen.getByRole('button', { name: /Confirm Override/ });
    expect(submitButton).toBeDisabled();
  });

  it('enables submit once a reason is entered', () => {
    renderWithClient(
      <ConsentOverrideModal consent={mockConsent} onClose={vi.fn()} onSuccess={vi.fn()} />,
    );
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'Customer called' } });
    const submitButton = screen.getByRole('button', { name: /Confirm Override/ });
    expect(submitButton).not.toBeDisabled();
  });

  it('calls onClose when Cancel is clicked', () => {
    const onClose = vi.fn();
    renderWithClient(
      <ConsentOverrideModal consent={mockConsent} onClose={onClose} onSuccess={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
