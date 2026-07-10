import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { FyAgentTab } from './FyAgentTab';

const mockUseApiKeys = vi.fn();
const mockUseIntegrations = vi.fn();
const mockCreateMutateAsync = vi.fn();
const mockRevokeMutateAsync = vi.fn();

vi.mock('../hooks/useApiKeys', () => ({
  useApiKeys: () => mockUseApiKeys(),
  useCreateApiKey: () => ({ mutateAsync: mockCreateMutateAsync, isPending: false }),
  useRevokeApiKey: () => ({ mutateAsync: mockRevokeMutateAsync, isPending: false }),
}));

vi.mock('../hooks/useIntegrations', () => ({
  useIntegrations: () => mockUseIntegrations(),
  useUpsertIntegration: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteIntegration: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTestIntegration: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}));

const fyKey = {
  id: '7f0c2c6a-6f5c-4b6e-9a44-1f2d3c4b5a69',
  name: 'Fy agent (AutoLabs)',
  prefix: 'pfy_ab12cd34',
  role: 'OP',
  scopes: ['bot:fy'],
  expiresAt: null,
  revokedAt: null,
  lastUsedAt: null,
  createdAt: '2026-07-07T00:00:00.000Z',
};

const plainKey = { ...fyKey, id: 'other', name: 'n8n', scopes: [] };

const fyWebhookDetail = {
  provider: 'fy_webhook',
  configured: false,
  source: 'none',
  enabled: true,
  maskedConfig: {},
  updatedAt: null,
};

describe('FyAgentTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseApiKeys.mockReturnValue({ data: [fyKey, plainKey], isLoading: false });
    mockUseIntegrations.mockReturnValue({
      data: [fyWebhookDetail],
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
  });

  it('lists only bot:fy scoped keys and shows the webhook provider card', () => {
    render(<FyAgentTab />);
    expect(screen.getByText('Fy agent (AutoLabs)')).toBeInTheDocument();
    expect(screen.queryByText('n8n')).not.toBeInTheDocument();
    expect(screen.getByText('Fy Agent Webhook')).toBeInTheDocument();
  });

  it('creates a preset bot:fy key without a scope picker', async () => {
    const user = userEvent.setup();
    mockCreateMutateAsync.mockResolvedValue({ ...fyKey, key: 'pfy_onetimesecret' });
    render(<FyAgentTab />);

    await user.click(screen.getByRole('button', { name: 'Create Fy API key' }));
    expect(screen.queryByLabelText('Fy Agent scope')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('API key name'), {
      target: { value: 'Fy agent (AutoLabs)' },
    });
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(mockCreateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ scopes: ['bot:fy'], role: 'OP' }),
    );
    expect(await screen.findByText('API key created')).toBeInTheDocument();
  });

  it('shows the empty state when no Fy key exists', () => {
    mockUseApiKeys.mockReturnValue({ data: [plainKey], isLoading: false });
    render(<FyAgentTab />);
    expect(screen.getByText('No Fy API keys')).toBeInTheDocument();
  });

  it('revokes a Fy key after confirmation', async () => {
    const user = userEvent.setup();
    mockRevokeMutateAsync.mockResolvedValue({ ...fyKey, revokedAt: '2026-07-09T00:00:00.000Z' });
    render(<FyAgentTab />);

    await user.click(screen.getByRole('button', { name: 'Revoke Fy agent (AutoLabs)' }));
    expect(await screen.findByText('Revoke Fy API key')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(mockRevokeMutateAsync).toHaveBeenCalledWith(fyKey.id);
  });
});
