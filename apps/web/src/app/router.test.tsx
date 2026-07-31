import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { PortalRedirect } from './router';

/**
 * The rental tenant portal link is sent by SMS, so its URL has to stay short.
 * `/portal/:token` is the canonical path and the two older, longer prefixes
 * redirect into it — links already in the wild must keep working without
 * dragging the browser back to a long URL.
 */
function CurrentPath() {
  const { pathname } = useLocation();
  return <div data-testid="pathname">{pathname}</div>;
}

function renderAt(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/portal/:token" element={<CurrentPath />} />
        <Route path="/rental-tenant-portal/:token" element={<PortalRedirect />} />
        <Route path="/tenant-portal/:token" element={<PortalRedirect />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('portal route aliases', () => {
  const TOKEN = 'kR7mQ2xLp9';

  it.each([
    ['/rental-tenant-portal', `/rental-tenant-portal/${TOKEN}`],
    ['/tenant-portal', `/tenant-portal/${TOKEN}`],
  ])('redirects %s to the short canonical path', (_label, initialPath) => {
    renderAt(initialPath);

    expect(screen.getByTestId('pathname')).toHaveTextContent(`/portal/${TOKEN}`);
  });

  it('leaves the canonical path untouched', () => {
    renderAt(`/portal/${TOKEN}`);

    expect(screen.getByTestId('pathname')).toHaveTextContent(`/portal/${TOKEN}`);
  });

  it('preserves a legacy 64-char hex token through the redirect', () => {
    // Tokens minted before the shortening are still live; the redirect must not
    // mangle or truncate them.
    const legacyToken = 'a'.repeat(64);
    renderAt(`/rental-tenant-portal/${legacyToken}`);

    expect(screen.getByTestId('pathname')).toHaveTextContent(`/portal/${legacyToken}`);
  });
});
