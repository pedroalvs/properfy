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
  name: 'n8n',
  prefix: 'pfy_ab12cd34',
  role: 'OP',
  scopes: [],
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

  it('lists keys with prefix and status, no key material', () => {
    render(<ApiKeysTab />);
    expect(screen.getByText('n8n')).toBeInTheDocument();
    expect(screen.getByText('pfy_ab12cd34…')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('shows the plaintext key exactly once after creation with a copy affordance', async () => {
    const user = userEvent.setup();
    mockCreateMutateAsync.mockResolvedValue({ ...activeKey, key: 'pfy_onetimesecret' });
    render(<ApiKeysTab />);

    await user.click(screen.getByRole('button', { name: 'New API key' }));
    fireEvent.change(screen.getByLabelText('API key name'), { target: { value: 'n8n' } });
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText('API key created')).toBeInTheDocument();
    expect(screen.getByText(/it will not be shown again/)).toBeInTheDocument();
    expect(mockCreateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'n8n', role: 'OP', scopes: [], expiresAt: null }),
    );

    await user.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('API key created')).not.toBeInTheDocument();
  });

  it('renders scope chips and sends the bot:fy scope when the checkbox is ticked', async () => {
    const user = userEvent.setup();
    mockUseApiKeys.mockReturnValue({
      data: [{ ...activeKey, name: 'fy', scopes: ['bot:fy'] }],
      isLoading: false,
    });
    mockCreateMutateAsync.mockResolvedValue({ ...activeKey, scopes: ['bot:fy'], key: 'pfy_onetimesecret' });
    render(<ApiKeysTab />);

    expect(screen.getAllByText('bot:fy').length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'New API key' }));
    fireEvent.change(screen.getByLabelText('API key name'), { target: { value: 'fy' } });
    await user.click(screen.getByLabelText('Fy Agent scope'));
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(mockCreateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ scopes: ['bot:fy'] }),
    );
  });

  it('revokes a key after confirmation', async () => {
    const user = userEvent.setup();
    mockRevokeMutateAsync.mockResolvedValue({ ...activeKey, revokedAt: '2026-07-07T01:00:00.000Z' });
    render(<ApiKeysTab />);

    await user.click(screen.getByRole('button', { name: 'Revoke n8n' }));
    expect(await screen.findByText('Revoke API key')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(mockRevokeMutateAsync).toHaveBeenCalledWith(activeKey.id);
  });
});
