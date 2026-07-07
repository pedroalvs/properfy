import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { IntegrationWarnings } from './IntegrationWarnings';

const mockUseIntegrationsStatus = vi.fn();
vi.mock('@/features/integrations/hooks/useIntegrationsStatus', () => ({
  useIntegrationsStatus: () => mockUseIntegrationsStatus(),
}));

function renderWarnings() {
  return render(
    <MemoryRouter>
      <IntegrationWarnings />
    </MemoryRouter>,
  );
}

describe('IntegrationWarnings', () => {
  beforeEach(() => {
    mockUseIntegrationsStatus.mockReset();
  });

  it('renders one warning per unconfigured integration with a link to the hub', () => {
    mockUseIntegrationsStatus.mockReturnValue({
      data: [
        { provider: 'resend', configured: false, source: 'none', enabled: true },
        { provider: 'mobile_message', configured: true, source: 'env', enabled: true },
        { provider: 'mapbox', configured: false, source: 'none', enabled: true },
      ],
    });
    renderWarnings();

    expect(screen.getByText(/Email sending is disabled/)).toBeInTheDocument();
    expect(screen.getByText(/Address geocoding is disabled/)).toBeInTheDocument();
    expect(screen.queryByText(/SMS sending is disabled/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Configure in Integrations/ })).toHaveLength(2);
  });

  it('renders nothing when everything is configured', () => {
    mockUseIntegrationsStatus.mockReturnValue({
      data: [
        { provider: 'resend', configured: true, source: 'database', enabled: true },
        { provider: 'mobile_message', configured: true, source: 'env', enabled: true },
        { provider: 'mapbox', configured: true, source: 'env', enabled: true },
      ],
    });
    const { container } = renderWarnings();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing while the query has no data (e.g. non-AM users)', () => {
    mockUseIntegrationsStatus.mockReturnValue({ data: undefined });
    const { container } = renderWarnings();
    expect(container).toBeEmptyDOMElement();
  });
});
