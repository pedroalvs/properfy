import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApiKeysTab } from './ApiKeysTab';

const mockUseApiKeys = vi.fn();
const mockCreateMutateAsync = vi.fn();
const mockRevokeMutateAsync = vi.fn();

vi.mock('../hooks/useApiKeys', () => ({
  useApiKeys: () => mockUseApiKeys(),
  useCreateApiKey: () => ({ mutateAsync: mockCreateMutateAsync, isPending: false }),
  useRevokeApiKey: () => ({ mutateAsync: mockRevokeMutateAsync, isPending: false }),
}));

vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}));

const activeKey = {
  id: '7f0c2c6a-6f5c-4b6e-9a44-1f2d3c4b5a69',
  name: 'Fy production',
  prefix: 'pfy_ab12cd34',
  role: 'OP',
  scopes: ['bot:fy'],
  expiresAt: null,
  revokedAt: null,
  lastUsedAt: null,
  createdAt: '2026-07-07T00:00:00.000Z',
};

describe('ApiKeysTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseApiKeys.mockReturnValue({ data: [activeKey], isLoading: false });
  });

  it('lists keys with prefix and status, no key material and no role/scope columns', () => {
    render(<ApiKeysTab />);
    expect(screen.getByText('Fy production')).toBeInTheDocument();
    expect(screen.getByText('pfy_ab12cd34…')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.queryByText('Role')).not.toBeInTheDocument();
    expect(screen.queryByText('Scopes')).not.toBeInTheDocument();
  });

  it('always creates keys with the bot:fy scope — no scope choice is offered', async () => {
    const user = userEvent.setup();
    mockCreateMutateAsync.mockResolvedValue({ ...activeKey, key: 'pfy_onetimesecret' });
    render(<ApiKeysTab />);

    await user.click(screen.getByRole('button', { name: 'New Fy key' }));
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('API key name'), { target: { value: 'Fy production' } });
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(mockCreateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Fy production', role: 'OP', scopes: ['bot:fy'], expiresAt: null }),
    );
  });

  it('shows the plaintext key exactly once after creation with a copy affordance', async () => {
    const user = userEvent.setup();
    mockCreateMutateAsync.mockResolvedValue({ ...activeKey, key: 'pfy_onetimesecret' });
    render(<ApiKeysTab />);

    await user.click(screen.getByRole('button', { name: 'New Fy key' }));
    fireEvent.change(screen.getByLabelText('API key name'), { target: { value: 'Fy production' } });
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('API key created')).toBeInTheDocument();
    expect(screen.getByText(/it will not be shown again/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('API key created')).not.toBeInTheDocument();
  });

  it('flags legacy unscoped keys instead of presenting them as Fy keys', () => {
    mockUseApiKeys.mockReturnValue({
      data: [activeKey, { ...activeKey, id: 'legacy-1', name: 'old n8n', prefix: 'pfy_old12345', scopes: [] }],
      isLoading: false,
      isError: false,
    });
    render(<ApiKeysTab />);
    expect(screen.getByText('old n8n')).toBeInTheDocument();
    expect(screen.getByText('Legacy — unscoped')).toBeInTheDocument();
  });

  it('renders a retryable error state when the keys query fails', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    mockUseApiKeys.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error('boom'), refetch });
    render(<ApiKeysTab />);

    expect(screen.getByText('Failed to load API keys')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Try Again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('revokes a key after confirmation', async () => {
    const user = userEvent.setup();
    mockRevokeMutateAsync.mockResolvedValue({ ...activeKey, revokedAt: '2026-07-07T01:00:00.000Z' });
    render(<ApiKeysTab />);

    await user.click(screen.getByRole('button', { name: 'Revoke Fy production' }));
    expect(await screen.findByText('Revoke API key')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(mockRevokeMutateAsync).toHaveBeenCalledWith(activeKey.id);
  });
});
