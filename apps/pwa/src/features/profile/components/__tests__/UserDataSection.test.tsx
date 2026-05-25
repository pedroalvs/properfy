import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/lib/auth-storage', () => ({
  authStorage: { getAccessToken: vi.fn(() => null), hasTokens: vi.fn(() => false), setTokens: vi.fn(), clearTokens: vi.fn() },
}));

const mockApiPatch = vi.fn();
vi.mock('@/services/api', () => ({
  api: { PATCH: (...args: unknown[]) => mockApiPatch(...args) },
}));

import { UserDataSection } from '../UserDataSection';

const INSPECTOR_ID = 'insp-1';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('UserDataSection', () => {
  it('renders phone input with initial value', () => {
    renderWithProviders(
      <UserDataSection inspectorId={INSPECTOR_ID} phone="+61400000001" />,
    );
    expect(screen.getByLabelText(/phone/i)).toHaveValue('+61400000001');
  });

  it('renders bank details as read-only with managed-by-ops message', () => {
    renderWithProviders(<UserDataSection inspectorId={INSPECTOR_ID} phone={null} />);
    expect(screen.getByText(/payment settings and region assignments are managed by your operations team/i)).toBeInTheDocument();
  });

  it('does not show save button when phone is unchanged', () => {
    renderWithProviders(
      <UserDataSection inspectorId={INSPECTOR_ID} phone="+61400000001" />,
    );
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
  });

  it('shows save button when phone is changed (dirty state)', () => {
    renderWithProviders(
      <UserDataSection inspectorId={INSPECTOR_ID} phone="+61400000001" />,
    );
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '+61400000002' } });
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
  });

  it('calls PATCH and triggers onSaved on success', async () => {
    const onSaved = vi.fn();
    mockApiPatch.mockResolvedValueOnce({ error: null });

    renderWithProviders(
      <UserDataSection inspectorId={INSPECTOR_ID} phone="+61400000001" onSaved={onSaved} />,
    );

    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '+61400000002' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith(
        expect.stringContaining('inspectors/me'),
        expect.objectContaining({ body: { phone: '+61400000002' } }),
      );
      expect(onSaved).toHaveBeenCalled();
    });
  });

  it('shows error message when PATCH fails', async () => {
    mockApiPatch.mockResolvedValueOnce({
      error: { error: { message: 'Server error' } },
    });

    renderWithProviders(<UserDataSection inspectorId={INSPECTOR_ID} phone={null} />);

    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '+61400000002' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });

  it('disables save button while saving', async () => {
    let resolve!: (v: unknown) => void;
    const pending = new Promise((r) => { resolve = r; });
    mockApiPatch.mockReturnValueOnce(pending);

    renderWithProviders(<UserDataSection inspectorId={INSPECTOR_ID} phone={null} />);
    fireEvent.change(screen.getByLabelText(/phone/i), { target: { value: '+61400000099' } });
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(screen.getByRole('button')).toBeDisabled();
    resolve({ error: null });
  });
});
