import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';

import { IntegrationsPage } from './IntegrationsPage';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname + location.search}</div>;
}

const mockUseIntegrations = vi.fn();
const mockUseApiKeys = vi.fn();

vi.mock('../hooks/useIntegrations', () => ({
  useIntegrations: () => mockUseIntegrations(),
}));

vi.mock('../hooks/useApiKeys', () => ({
  useApiKeys: () => mockUseApiKeys(),
}));

function makeDetail(provider: string, source: 'database' | 'env' | 'none' = 'database') {
  return {
    provider,
    configured: source !== 'none',
    source,
    enabled: true,
    maskedConfig: {},
    updatedAt: '2026-07-07T00:00:00.000Z',
  };
}

function renderPage(initialEntry = '/integrations') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <IntegrationsPage />
      <LocationProbe />
    </MemoryRouter>,
  );
}

describe('IntegrationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseIntegrations.mockReturnValue({
      data: [
        makeDetail('resend'),
        makeDetail('mobile_message'),
        makeDetail('mapbox', 'env'),
        makeDetail('fy_webhook', 'none'),
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    mockUseApiKeys.mockReturnValue({
      data: [
        { id: '1', name: 'fy', prefix: 'pfy_1', role: 'OP', scopes: ['bot:fy'], expiresAt: null, revokedAt: null, lastUsedAt: null, createdAt: '2026-07-07T00:00:00.000Z' },
        { id: '2', name: 'old', prefix: 'pfy_2', role: 'OP', scopes: ['bot:fy'], expiresAt: null, revokedAt: '2026-07-07T00:00:00.000Z', lastUsedAt: null, createdAt: '2026-07-07T00:00:00.000Z' },
      ],
      isLoading: false,
    });
  });

  it('renders one tile per provider linking to its own page', () => {
    renderPage();
    expect(screen.getByRole('link', { name: /Resend/ })).toHaveAttribute('href', '/integrations/resend');
    expect(screen.getByRole('link', { name: /MobileMessage/ })).toHaveAttribute('href', '/integrations/mobile-message');
    expect(screen.getByRole('link', { name: /Mapbox/ })).toHaveAttribute('href', '/integrations/mapbox');
    expect(screen.getByRole('link', { name: /Fy Agent Webhook/ })).toHaveAttribute('href', '/integrations/fy-webhook');
  });

  it('shows the configuration status on each tile', () => {
    renderPage();
    expect(screen.getAllByText('Configured (hub)')).toHaveLength(2);
    expect(screen.getByText('Configured (environment)')).toBeInTheDocument();
    expect(screen.getByText('Not configured')).toBeInTheDocument();
  });

  it('shows the Fy integration tile with the active key count on the API Keys tab', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('tab', { name: 'API Keys' }));

    const fyTile = screen.getByRole('link', { name: /Fy Integration/ });
    expect(fyTile).toHaveAttribute('href', '/integrations/fy-api');
    expect(screen.getByText(/1 active key/)).toBeInTheDocument();
  });

  it('opens directly on the API Keys tab via the tab query param', () => {
    renderPage('/integrations?tab=api-keys');
    expect(screen.getByRole('link', { name: /Fy Integration/ })).toBeInTheDocument();
  });

  it('keeps the active tab in the URL when switching tabs', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole('tab', { name: 'API Keys' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/integrations?tab=api-keys');

    await user.click(screen.getByRole('tab', { name: 'Integrations' }));
    expect(screen.getByTestId('location')).toHaveTextContent(/^\/integrations$/);
  });

  it('excludes legacy unscoped keys from the Fy tile count', async () => {
    const user = userEvent.setup();
    mockUseApiKeys.mockReturnValue({
      data: [
        { id: '1', name: 'fy', prefix: 'pfy_1', role: 'OP', scopes: ['bot:fy'], expiresAt: null, revokedAt: null, lastUsedAt: null, createdAt: '2026-07-07T00:00:00.000Z' },
        { id: '3', name: 'legacy general', prefix: 'pfy_3', role: 'OP', scopes: [], expiresAt: null, revokedAt: null, lastUsedAt: null, createdAt: '2026-07-07T00:00:00.000Z' },
      ],
      isLoading: false,
      isError: false,
    });
    renderPage();

    await user.click(screen.getByRole('tab', { name: 'API Keys' }));
    expect(screen.getByText('1 active key')).toBeInTheDocument();
  });

  it('surfaces API-key query loading and error states on the Fy tile', async () => {
    const user = userEvent.setup();
    mockUseApiKeys.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    renderPage();

    await user.click(screen.getByRole('tab', { name: 'API Keys' }));
    expect(screen.getByText('Key count unavailable')).toBeInTheDocument();
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  it('shows an empty state when the API returns no integrations', () => {
    mockUseIntegrations.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText('No integrations')).toBeInTheDocument();
  });
});
