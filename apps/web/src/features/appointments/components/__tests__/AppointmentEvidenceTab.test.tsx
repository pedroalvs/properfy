import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockShowError = vi.fn();

vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess: vi.fn(), showError: mockShowError }),
  SnackbarProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));

vi.mock('@/lib/auth-storage', () => ({
  authStorage: {
    getAccessToken: vi.fn(() => null),
    hasTokens: vi.fn(() => false),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
  },
}));

const mockApiGet = vi.fn();

vi.mock('@/services/api', () => ({
  api: { GET: (...args: unknown[]) => mockApiGet(...args) },
}));

import { AppointmentEvidenceTab } from '../AppointmentEvidenceTab';

const APPOINTMENT_ID = 'e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a55';
const ASSET_ID = 'a1eebc99-9c0b-4ef8-bb6d-6bb9bd380a77';

const ASSET_STUB = {
  id: ASSET_ID,
  storageKey: `execution/${APPOINTMENT_ID}/photo.jpg`,
  mimeType: 'image/jpeg',
  sizeBytes: 204800,
  kind: 'PHOTO',
  status: 'UPLOADED',
  originalFilename: 'foto_sala.jpg',
  createdAt: new Date('2026-01-15T10:00:00Z').toISOString(),
};

function renderTab() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AppointmentEvidenceTab appointmentId={APPOINTMENT_ID} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('AppointmentEvidenceTab', () => {
  it('shows empty state when no assets', async () => {
    mockApiGet.mockResolvedValueOnce({ data: { data: [] }, error: null });
    renderTab();
    await waitFor(() => {
      expect(screen.getByText(/no evidence uploaded/i)).toBeInTheDocument();
    });
  });

  it('renders asset with originalFilename', async () => {
    mockApiGet.mockResolvedValueOnce({ data: { data: [ASSET_STUB] }, error: null });
    renderTab();
    await waitFor(() => {
      expect(screen.getByText('foto_sala.jpg')).toBeInTheDocument();
    });
  });

  it('renders mimeType and formatted size', async () => {
    mockApiGet.mockResolvedValueOnce({ data: { data: [ASSET_STUB] }, error: null });
    renderTab();
    await waitFor(() => {
      expect(screen.getByText(/image\/jpeg/)).toBeInTheDocument();
      expect(screen.getByText(/200 KB/)).toBeInTheDocument();
    });
  });

  it('renders download button and triggers download on click', async () => {
    // 1st call: list assets
    mockApiGet.mockResolvedValueOnce({ data: { data: [ASSET_STUB] }, error: null });
    // 2nd call: thumbnail fetch (image asset triggers useAssetThumbnail)
    mockApiGet.mockResolvedValueOnce({ data: null, error: null });
    // 3rd call: download URL fetch on button click
    mockApiGet.mockResolvedValueOnce({
      data: { downloadUrl: 'https://example.com/dl' },
      error: null,
    });

    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    renderTab();

    const downloadBtn = await screen.findByRole('button', { name: /download foto_sala\.jpg/i });
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith('https://example.com/dl', '_blank');
    });
    openSpy.mockRestore();
  });

  it('shows error state when API fails', async () => {
    mockApiGet.mockResolvedValueOnce({ data: null, error: { message: 'Server error' } });
    renderTab();
    await waitFor(() => {
      expect(screen.getByText(/failed to load evidence/i)).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    mockApiGet.mockReturnValue(new Promise(() => {}));
    renderTab();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
