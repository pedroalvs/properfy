import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, matchRoutes, useLocation } from 'react-router-dom';
import { PortalRedirect, routes } from './router';

/**
 * The rental tenant portal link is sent by SMS, so its URL has to stay short.
 * `/portal/:token` is the canonical path and the two older, longer prefixes
 * redirect into it — links already in the wild must keep working without
 * dragging the browser back to a long URL.
 */
const TOKEN = 'kR7mQ2xLp9nT4vB8';

function routeElementFor(pathname: string) {
  const matches = matchRoutes(routes, pathname);
  expect(matches, `no route matched ${pathname}`).toBeTruthy();
  return matches!.at(-1)!.route.element as React.ReactElement;
}

// These assert the real exported route table, not a stand-in. A parallel
// <Routes> declared inside the test would keep passing while the app itself was
// wired backwards.
describe('portal route wiring', () => {
  it('serves the canonical path with the portal page, not a redirect', () => {
    // If /portal/:token ever pointed at PortalRedirect again — which is what
    // develop looked like before the paths were flipped — the redirect would
    // match itself and loop forever, blanking every link sent by SMS.
    expect(routeElementFor(`/portal/${TOKEN}`).type).not.toBe(PortalRedirect);
  });

  it.each(['/rental-tenant-portal', '/tenant-portal'])(
    'wires the legacy prefix %s to the redirect',
    (prefix) => {
      expect(routeElementFor(`${prefix}/${TOKEN}`).type).toBe(PortalRedirect);
    },
  );
});

function CurrentPath() {
  const { pathname } = useLocation();
  return <div data-testid="pathname">{pathname}</div>;
}

function renderRedirectAt(initialPath: string) {
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

describe('PortalRedirect', () => {
  it.each([
    ['/rental-tenant-portal', `/rental-tenant-portal/${TOKEN}`],
    ['/tenant-portal', `/tenant-portal/${TOKEN}`],
  ])('sends %s to the short canonical path', (_label, initialPath) => {
    renderRedirectAt(initialPath);

    expect(screen.getByTestId('pathname')).toHaveTextContent(`/portal/${TOKEN}`);
  });

  it('preserves a legacy 64-char hex token through the redirect', () => {
    // Tokens minted before the shortening are still live; the redirect must not
    // mangle or truncate them.
    const legacyToken = 'a'.repeat(64);
    renderRedirectAt(`/rental-tenant-portal/${legacyToken}`);

    expect(screen.getByTestId('pathname')).toHaveTextContent(`/portal/${legacyToken}`);
  });
});
