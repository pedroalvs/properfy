import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/config/env', () => ({ env: { apiBaseUrl: 'http://localhost:3000' } }));

vi.mock('@/lib/auth-storage', () => ({
  authStorage: {
    getAccessToken: vi.fn(() => null),
    hasTokens: vi.fn(() => false),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
  },
}));

vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
  SnackbarProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const mockApiGet = vi.fn();

vi.mock('@/services/api', () => ({
  api: { GET: (...args: unknown[]) => mockApiGet(...args) },
}));

import { InspectorDetailSections } from '../InspectorDetailSections';
import type { InspectorDetail } from '../../types';

const BASE_INSPECTOR: InspectorDetail = {
  id: 'insp-1',
  name: 'Alice Smith',
  fullName: 'Alice Mary Smith',
  email: 'alice@example.com',
  phone: '+61400000001',
  abn: '12345678901',
  status: 'ACTIVE',
  regionIds: [],
  regionsCount: 0,
  serviceTypes: [],
  serviceTypesCount: 0,
  clientEligibility: [],
  blockedClients: [],
  insuranceFileKey: null,
  insuranceExpiresAt: null,
  insuranceMetaJson: null,
  policeCheckFileKey: null,
  policeCheckExpiresAt: null,
  policeCheckMetaJson: null,
  createdAt: new Date('2026-01-01').toISOString(),
  updatedAt: new Date('2026-01-01').toISOString(),
};

function renderSections(inspector: InspectorDetail = BASE_INSPECTOR) {
  mockApiGet.mockResolvedValue({ data: { data: [], pagination: { total: 0 } }, error: null });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <InspectorDetailSections inspector={inspector} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('InspectorDetailSections', () => {
  it('renders inspector name and email', () => {
    renderSections();
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
  });

  it('renders insurance filename from insuranceMetaJson', () => {
    renderSections({
      ...BASE_INSPECTOR,
      insuranceMetaJson: { fileName: 'insurance_2026.pdf', uploadedAt: '2026-01-01' },
    });
    expect(screen.getByText('insurance_2026.pdf')).toBeInTheDocument();
  });

  it('renders police check filename from policeCheckMetaJson', () => {
    renderSections({
      ...BASE_INSPECTOR,
      policeCheckMetaJson: { fileName: 'police_check.pdf', uploadedAt: '2026-01-01' },
    });
    expect(screen.getByText('police_check.pdf')).toBeInTheDocument();
  });

  it('shows insurance download button when insurance file exists', () => {
    renderSections({
      ...BASE_INSPECTOR,
      insuranceMetaJson: { fileName: 'insurance.pdf' },
    });
    expect(screen.getByRole('button', { name: /download insurance/i })).toBeInTheDocument();
  });

  it('shows police check download button when police check file exists', () => {
    renderSections({
      ...BASE_INSPECTOR,
      policeCheckMetaJson: { fileName: 'police.pdf' },
    });
    expect(screen.getByRole('button', { name: /download police check/i })).toBeInTheDocument();
  });

  it('calls download API when insurance download button clicked', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    // Default mock keeps every render-time `api.GET` returning the
    // paginated empty-list shape so the component does not crash. Once
    // the user clicks download, the next `api.GET` is overridden by the
    // `mockResolvedValueOnce` below — UX-baseline cleanup wraps the
    // download response in `{ data: { downloadUrl, fileName } }`.
    mockApiGet.mockResolvedValue({ data: { data: [], pagination: { total: 0 } }, error: null });
    mockApiGet.mockResolvedValueOnce({ data: { data: [], pagination: { total: 0 } }, error: null });
    mockApiGet.mockResolvedValueOnce({ data: { data: [], pagination: { total: 0 } }, error: null });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <InspectorDetailSections
          inspector={{ ...BASE_INSPECTOR, insuranceMetaJson: { fileName: 'insurance.pdf' } }}
        />
      </QueryClientProvider>,
    );

    const btn = await screen.findByRole('button', { name: /download insurance/i });
    // Override the next call (the download fetch) with the wrapped envelope.
    mockApiGet.mockResolvedValueOnce({
      data: { data: { downloadUrl: 'https://example.com/dl', fileName: 'insurance.pdf' } },
      error: null,
    });
    fireEvent.click(btn);

    await waitFor(() => {
      expect(openSpy).toHaveBeenCalledWith(expect.stringContaining('https://'), '_blank');
    });
    openSpy.mockRestore();
  });

  it('does not show download buttons when no files are present', () => {
    renderSections();
    expect(screen.queryByRole('button', { name: /download insurance/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /download police check/i })).not.toBeInTheDocument();
  });
});
