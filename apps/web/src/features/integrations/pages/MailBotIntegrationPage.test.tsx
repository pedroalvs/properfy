import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import { MailBotIntegrationPage } from './MailBotIntegrationPage';

vi.mock('../components/ApiKeysTab', () => ({
  ApiKeysTab: ({ keyType }: { keyType?: { id: string } }) => (
    <div data-testid="api-keys-tab" data-key-type={keyType?.id} />
  ),
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
        <Route path="/integrations/mail-bot" element={<MailBotIntegrationPage />} />
        <Route path="/integrations" element={<HubMarker />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('MailBotIntegrationPage', () => {
  it('renders the Mail Bot header and passes the mail key type to the keys tab', () => {
    renderAt('/integrations/mail-bot');
    expect(screen.getByRole('heading', { name: 'Mail Bot - AutoLabs' })).toBeInTheDocument();
    expect(screen.getByTestId('api-keys-tab')).toHaveAttribute('data-key-type', 'mail');
  });

  it('renders exactly one header Back button', () => {
    renderAt('/integrations/mail-bot');
    expect(screen.getAllByRole('button', { name: 'Back' })).toHaveLength(1);
  });

  it('Back on a direct entry falls back to the integrations API keys tab', () => {
    renderAt('/integrations/mail-bot');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByTestId('hub-fallback')).toHaveTextContent('/integrations?tab=api-keys');
  });
});
