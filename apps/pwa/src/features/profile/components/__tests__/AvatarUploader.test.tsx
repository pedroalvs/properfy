import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));
vi.mock('@/lib/auth-storage', () => ({
  authStorage: { getAccessToken: vi.fn(() => null), hasTokens: vi.fn(() => false), setTokens: vi.fn(), clearTokens: vi.fn() },
}));

const mockApiPost = vi.fn();
vi.mock('@/services/api', () => ({
  api: { POST: (...args: unknown[]) => mockApiPost(...args) },
}));

const originalFetch = global.fetch;
const mockFetch = vi.fn();

import { AvatarUploader } from '../AvatarUploader';

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = mockFetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

const INSPECTOR_ID = 'insp-1';

function makeFile(name = 'photo.jpg', type = 'image/jpeg', size = 1024) {
  return new File(['x'.repeat(size)], name, { type });
}

describe('AvatarUploader', () => {
  it('renders the camera button', () => {
    renderWithProviders(<AvatarUploader inspectorId={INSPECTOR_ID} onUploaded={vi.fn()} />);
    expect(screen.getByRole('button', { name: /change profile photo/i })).toBeInTheDocument();
  });

  it('shows error for unsupported MIME type', async () => {
    renderWithProviders(<AvatarUploader inspectorId={INSPECTOR_ID} onUploaded={vi.fn()} />);

    const input = screen.getByLabelText(/upload profile photo/i);
    fireEvent.change(input, { target: { files: [makeFile('doc.pdf', 'application/pdf')] } });

    await waitFor(() => {
      expect(screen.getByRole('button')).toHaveAttribute('title', expect.stringMatching(/only png/i));
    });
  });

  it('shows error for file over 5 MB', async () => {
    renderWithProviders(<AvatarUploader inspectorId={INSPECTOR_ID} onUploaded={vi.fn()} />);

    const input = screen.getByLabelText(/upload profile photo/i);
    const bigFile = makeFile('big.jpg', 'image/jpeg', 6 * 1024 * 1024);
    fireEvent.change(input, { target: { files: [bigFile] } });

    await waitFor(() => {
      expect(screen.getByRole('button')).toHaveAttribute('title', expect.stringMatching(/5 mb/i));
    });
  });

  it('calls onUploaded after successful presign → PUT → confirm flow', async () => {
    const onUploaded = vi.fn();
    // UX-baseline cleanup: presign response wrapped in `{ data: {...} }`.
    mockApiPost
      .mockResolvedValueOnce({
        data: { data: { uploadUrl: 'https://supabase.example/upload', storageKey: 'inspectors/insp-1/avatar.jpg' } },
        error: null,
      })
      .mockResolvedValueOnce({ data: { data: {} }, error: null });
    mockFetch.mockResolvedValueOnce({ ok: true });

    renderWithProviders(<AvatarUploader inspectorId={INSPECTOR_ID} onUploaded={onUploaded} />);

    const input = screen.getByLabelText(/upload profile photo/i);
    fireEvent.change(input, { target: { files: [makeFile()] } });

    await waitFor(() => {
      expect(onUploaded).toHaveBeenCalled();
    });
  });

  it('shows error when presign fails', async () => {
    mockApiPost.mockResolvedValueOnce({ data: null, error: { message: 'Forbidden' } });

    renderWithProviders(<AvatarUploader inspectorId={INSPECTOR_ID} onUploaded={vi.fn()} />);

    const input = screen.getByLabelText(/upload profile photo/i);
    fireEvent.change(input, { target: { files: [makeFile()] } });

    await waitFor(() => {
      expect(screen.getByRole('button')).toHaveAttribute('title', expect.stringMatching(/failed/i));
    });
  });

  it('shows error when PUT upload fails', async () => {
    // UX-baseline cleanup: presign response wrapped in `{ data: {...} }`.
    mockApiPost.mockResolvedValueOnce({
      data: { data: { uploadUrl: 'https://supabase.example/upload', storageKey: 'key.jpg' } },
      error: null,
    });
    mockFetch.mockResolvedValueOnce({ ok: false });

    renderWithProviders(<AvatarUploader inspectorId={INSPECTOR_ID} onUploaded={vi.fn()} />);

    const input = screen.getByLabelText(/upload profile photo/i);
    fireEvent.change(input, { target: { files: [makeFile()] } });

    await waitFor(() => {
      expect(screen.getByRole('button')).toHaveAttribute('title', 'Upload failed');
    });
  });

  it('disables button while uploading', async () => {
    let resolvePresign!: (v: unknown) => void;
    const presignPromise = new Promise((r) => { resolvePresign = r; });
    mockApiPost.mockReturnValueOnce(presignPromise);

    renderWithProviders(<AvatarUploader inspectorId={INSPECTOR_ID} onUploaded={vi.fn()} />);

    const input = screen.getByLabelText(/upload profile photo/i);
    fireEvent.change(input, { target: { files: [makeFile()] } });

    expect(screen.getByRole('button', { name: /change profile photo/i })).toBeDisabled();

    resolvePresign({ data: null, error: { message: 'err' } });
  });
});
