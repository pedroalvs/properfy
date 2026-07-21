import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { IntegrationDetailPage } from './IntegrationDetailPage';

const mockUseIntegrations = vi.fn();

vi.mock('../hooks/useIntegrations', () => ({
  useIntegrations: () => mockUseIntegrations(),
  useUpsertIntegration: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteIntegration: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useTestIntegration: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}));

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/integrations/:provider" element={<IntegrationDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('IntegrationDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIntegrations.mockReturnValue({
      data: [
        {
          provider: 'resend',
          configured: true,
          source: 'database',
          enabled: true,
          maskedConfig: { apiKey: '••••abcd', fromEmail: 'no@x.com' },
          updatedAt: '2026-07-07T00:00:00.000Z',
        },
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('renders the provider settings form for a known slug', () => {
    renderAt('/integrations/resend');
    expect(screen.getByRole('heading', { name: 'Resend' })).toBeInTheDocument();
    expect(screen.getByLabelText('Resend API Key')).toBeInTheDocument();
    expect(screen.getByText('Configured (hub)')).toBeInTheDocument();
  });

  it('shows a not-found state for an unknown slug', () => {
    renderAt('/integrations/unknown-provider');
    expect(screen.getByText(/Integration not found/)).toBeInTheDocument();
  });
});
