import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { IntegrationDetail } from '@properfy/shared';

import { IntegrationCard } from './IntegrationCard';
import { PROVIDER_META } from '../providerMeta';

const mockUpsertMutateAsync = vi.fn();
const mockDeleteMutateAsync = vi.fn();
const mockTestMutateAsync = vi.fn();

vi.mock('../hooks/useIntegrations', () => ({
  useUpsertIntegration: () => ({ mutateAsync: mockUpsertMutateAsync, isPending: false }),
  useDeleteIntegration: () => ({ mutateAsync: mockDeleteMutateAsync, isPending: false }),
  useTestIntegration: () => ({ mutateAsync: mockTestMutateAsync, isPending: false }),
}));

vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}));

const resendMeta = PROVIDER_META.find((meta) => meta.provider === 'resend')!;

function makeDetail(overrides: Partial<IntegrationDetail> = {}): IntegrationDetail {
  return {
    provider: 'resend',
    configured: true,
    source: 'database',
    enabled: true,
    maskedConfig: { apiKey: '••••abcd', fromEmail: 'no@x.com' },
    updatedAt: '2026-07-07T00:00:00.000Z',
    ...overrides,
  };
}

describe('IntegrationCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows masked placeholders and disables Save until a field is edited', () => {
    render(<IntegrationCard meta={resendMeta} detail={makeDetail()} />);
    expect(screen.getByLabelText('Resend API Key')).toHaveAttribute('placeholder', '••••abcd');
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
    expect(screen.getByText('Configured (hub)')).toBeInTheDocument();
  });

  it('saves only the edited fields (write-only secrets)', async () => {
    const user = userEvent.setup();
    mockUpsertMutateAsync.mockResolvedValue(makeDetail());
    render(<IntegrationCard meta={resendMeta} detail={makeDetail()} />);

    fireEvent.change(screen.getByLabelText('Resend From Email'), {
      target: { value: 'new@x.com' },
    });
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(mockUpsertMutateAsync).toHaveBeenCalledWith({
      provider: 'resend',
      config: { fromEmail: 'new@x.com' },
    });
  });

  it('runs a connection test and renders its result', async () => {
    const user = userEvent.setup();
    mockTestMutateAsync.mockResolvedValue({ ok: false, message: 'Resend rejected the credentials (HTTP 401)' });
    render(<IntegrationCard meta={resendMeta} detail={makeDetail()} />);

    await user.click(screen.getByRole('button', { name: 'Test connection' }));
    expect(await screen.findByText(/Resend rejected the credentials/)).toBeInTheDocument();
  });

  it('disables Test connection when the provider is not configured and hides Remove for env source', () => {
    render(
      <IntegrationCard
        meta={resendMeta}
        detail={makeDetail({ configured: false, source: 'none', maskedConfig: { apiKey: null, fromEmail: null } })}
      />,
    );
    expect(screen.getByRole('button', { name: 'Test connection' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
  });

  it('removes the database config after confirmation', async () => {
    const user = userEvent.setup();
    mockDeleteMutateAsync.mockResolvedValue(undefined);
    render(<IntegrationCard meta={resendMeta} detail={makeDetail()} />);

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(await screen.findByText('Remove Resend settings')).toBeInTheDocument();
    const removeButtons = screen.getAllByRole('button', { name: /^Remove$/ });
    await user.click(removeButtons[removeButtons.length - 1]!);
    expect(mockDeleteMutateAsync).toHaveBeenCalledWith('resend');
  });
});
