import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import { FyIntegrationPage } from './FyIntegrationPage';

vi.mock('../components/ApiKeysTab', () => ({
  ApiKeysTab: () => <div data-testid="api-keys-tab" />,
}));

function renderAt(path: string) {
  function HubMarker() {
    const location = useLocation();
    return <div data-testid="hub-fallback">{location.pathname + location.search}</div>;
  }
  return render(
    <MemoryRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      initialEntries={[path]}
    >
      <Routes>
        <Route path="/integrations/fy-api" element={<FyIntegrationPage />} />
        <Route path="/integrations" element={<HubMarker />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('FyIntegrationPage', () => {
  it('renders exactly one header Back button (P-a)', () => {
    renderAt('/integrations/fy-api');
    expect(screen.getAllByRole('button', { name: 'Back' })).toHaveLength(1);
  });

  it('Back on a direct entry falls back to the integrations API keys tab (P-b)', () => {
    renderAt('/integrations/fy-api');

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    const marker = screen.getByTestId('hub-fallback');
    expect(marker).toBeInTheDocument();
    expect(marker).toHaveTextContent('/integrations?tab=api-keys');
  });
});
