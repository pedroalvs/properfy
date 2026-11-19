import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ConsentOptOutModal } from './ConsentOptOutModal';
import { api } from '@/services/api';

vi.mock('@/services/api', () => ({
  api: { POST: vi.fn().mockResolvedValue({ data: { data: {} }, error: null }) },
}));

// Stub the searchable agency picker with a plain select so the modal test does
// not depend on the /v1/tenants search query; it still exercises `onChange`.
vi.mock('@/features/apps/components/AgencySelect', () => ({
  AgencySelect: ({ value, onChange, 'aria-label': ariaLabel }: { value: string; onChange: (v: string) => void; 'aria-label'?: string }) => (
    <select aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select agency</option>
      <option value="00000000-0000-0000-0000-000000000007">Agency Seven</option>
    </select>
  ),
}));

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

function fillAgency() {
  fireEvent.change(screen.getByLabelText('Agency'), {
    target: { value: '00000000-0000-0000-0000-000000000007' },
  });
}

describe('ConsentOptOutModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.POST).mockResolvedValue({ data: { data: {} }, error: null } as never);
  });

  it('is an accessible dialog with the recipient pre-filled from the search', () => {
    renderWithClient(<ConsentOptOutModal initialRecipient="+61412000001" onClose={vi.fn()} onSuccess={vi.fn()} />);
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Record opt-out');
    expect(screen.getByLabelText('Recipient (email or mobile)', { exact: false })).toHaveValue('+61412000001');
  });

  it('keeps the submit button disabled until agency, recipient and reason are filled', async () => {
    renderWithClient(<ConsentOptOutModal initialRecipient="+61412000001" onClose={vi.fn()} onSuccess={vi.fn()} />);
    const submit = screen.getByRole('button', { name: 'Record opt-out' });
    expect(submit).toBeDisabled(); // no agency / no reason yet
    fillAgency();
    expect(submit).toBeDisabled(); // reason still empty
    fireEvent.change(screen.getByLabelText('Reason', { exact: false }), { target: { value: 'stop' } });
    expect(submit).toBeEnabled();
  });

  it('posts the opt-out and calls onSuccess', async () => {
    const onSuccess = vi.fn();
    renderWithClient(<ConsentOptOutModal initialRecipient="+61412000001" onClose={vi.fn()} onSuccess={onSuccess} />);
    fillAgency();
    fireEvent.change(screen.getByLabelText('Reason *', { exact: false }), {
      target: { value: 'Tenant asked to stop' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Record opt-out' }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(api.POST).toHaveBeenCalledWith('/v1/notifications/consents/opt-out', {
      body: {
        tenantId: '00000000-0000-0000-0000-000000000007',
        recipient: '+61412000001',
        channel: 'SMS',
        reason: 'Tenant asked to stop',
      },
    });
  });

  it('surfaces a server error (403/400) in the modal', async () => {
    vi.mocked(api.POST).mockResolvedValue({ data: undefined, error: { error: { message: 'Forbidden' } }, response: { status: 403 } } as never);
    renderWithClient(<ConsentOptOutModal initialRecipient="x@y.com" onClose={vi.fn()} onSuccess={vi.fn()} />);
    fillAgency();
    fireEvent.change(screen.getByLabelText('Reason *', { exact: false }), { target: { value: 'stop' } });
    fireEvent.click(screen.getByRole('button', { name: 'Record opt-out' }));
    await waitFor(() => expect(screen.getByText('Forbidden')).toBeInTheDocument());
  });
});
