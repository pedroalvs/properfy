/**
 * Issue #2 (UX smoke) anti-regression — pin that the router promotes
 * `AppErrorBoundary` instead of React Router's dev "Hey developer 👋"
 * placeholder when a child route throws.
 *
 * Strategy: one full-router integration test proves the wiring (a
 * render-time crash inside a child route is caught and routed to the
 * boundary). The status-aware branches (404 / 403 / 5xx) are covered
 * via a direct hook-mock of `useRouteError` because exercising them
 * through a router `loader` triggers a jsdom/undici AbortSignal
 * incompatibility unrelated to our code path — that's an environment
 * issue, not a contract gap, and the hook-mock validates the same
 * rendering logic with full coverage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, MemoryRouter, Outlet, RouterProvider } from 'react-router-dom';

// Hoist-friendly mock; individual specs override `useRouteError` /
// `isRouteErrorResponse` to simulate router-thrown Responses.
const mockUseRouteError = vi.fn();
const mockIsRouteErrorResponse = vi.fn();

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
type ReactRouterModule = typeof import('react-router-dom');

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<ReactRouterModule>('react-router-dom');
  return {
    ...actual,
    useRouteError: () => mockUseRouteError(),
    isRouteErrorResponse: (e: unknown) => mockIsRouteErrorResponse(e),
  };
});

import { AppErrorBoundary } from './AppErrorBoundary';

function Crasher(): never {
  throw new Error('boom — render-time crash');
}

function buildRouterWithRenderCrash() {
  return createMemoryRouter(
    [
      {
        path: '/',
        element: <Outlet />,
        errorElement: <AppErrorBoundary />,
        children: [{ path: 'crash', element: <Crasher /> }],
      },
    ],
    { initialEntries: ['/crash'] },
  );
}

beforeEach(() => {
  // Default: not a router-error-response. Specs that test 4xx/5xx
  // override both mocks. The integration test re-arms the mocks to
  // return the real error caught by the router.
  mockIsRouteErrorResponse.mockReturnValue(false);
  mockUseRouteError.mockReturnValue(new Error('boom — render-time crash'));
});

describe('AppErrorBoundary — Issue #2 anti-regression', () => {
  it('is wired via errorElement and replaces the React Router placeholder on a render crash', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(<RouterProvider router={buildRouterWithRenderCrash()} />);

    expect(await screen.findByTestId('app-error-boundary')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(
      screen.getByText(/An unexpected error happened while loading this page/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /go back/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument();
    // Negative: the React Router dev placeholder must NOT appear.
    expect(screen.queryByText(/Hey developer/i)).not.toBeInTheDocument();

    errSpy.mockRestore();
  });

  it('renders the generic "Something went wrong" copy for a plain Error', () => {
    mockUseRouteError.mockReturnValue(new Error('plain throw'));
    mockIsRouteErrorResponse.mockReturnValue(false);

    // `useNavigate()` inside AppErrorBoundary needs a Router context;
    // a minimal MemoryRouter provides it without re-entering the
    // memory-router-loader path that hit jsdom's AbortSignal issue.
    render(
      <MemoryRouter>
        <AppErrorBoundary />
      </MemoryRouter>,
    );

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(
      screen.getByText(/An unexpected error happened while loading this page/i),
    ).toBeInTheDocument();
  });

  it('renders "Page not found" for a router 404 response', () => {
    mockUseRouteError.mockReturnValue({ status: 404, statusText: 'Not Found' });
    mockIsRouteErrorResponse.mockReturnValue(true);

    // `useNavigate()` inside AppErrorBoundary needs a Router context;
    // a minimal MemoryRouter provides it without re-entering the
    // memory-router-loader path that hit jsdom's AbortSignal issue.
    render(
      <MemoryRouter>
        <AppErrorBoundary />
      </MemoryRouter>,
    );

    expect(screen.getByText('Page not found')).toBeInTheDocument();
    expect(
      screen.getByText(/doesn't exist or has been moved/i),
    ).toBeInTheDocument();
  });

  it('renders "Access denied" for a router 403 response', () => {
    mockUseRouteError.mockReturnValue({ status: 403, statusText: 'Forbidden' });
    mockIsRouteErrorResponse.mockReturnValue(true);

    // `useNavigate()` inside AppErrorBoundary needs a Router context;
    // a minimal MemoryRouter provides it without re-entering the
    // memory-router-loader path that hit jsdom's AbortSignal issue.
    render(
      <MemoryRouter>
        <AppErrorBoundary />
      </MemoryRouter>,
    );

    expect(screen.getByText('Access denied')).toBeInTheDocument();
    expect(
      screen.getByText(/You don't have permission/i),
    ).toBeInTheDocument();
  });

  it('renders "Server error" for a router 5xx response', () => {
    mockUseRouteError.mockReturnValue({ status: 503, statusText: 'Service Unavailable' });
    mockIsRouteErrorResponse.mockReturnValue(true);

    // `useNavigate()` inside AppErrorBoundary needs a Router context;
    // a minimal MemoryRouter provides it without re-entering the
    // memory-router-loader path that hit jsdom's AbortSignal issue.
    render(
      <MemoryRouter>
        <AppErrorBoundary />
      </MemoryRouter>,
    );

    expect(screen.getByText('Server error')).toBeInTheDocument();
  });

  it('exposes a developer-details affordance in DEV mode', () => {
    mockUseRouteError.mockReturnValue(new Error('plain throw'));
    mockIsRouteErrorResponse.mockReturnValue(false);

    // `useNavigate()` inside AppErrorBoundary needs a Router context;
    // a minimal MemoryRouter provides it without re-entering the
    // memory-router-loader path that hit jsdom's AbortSignal issue.
    render(
      <MemoryRouter>
        <AppErrorBoundary />
      </MemoryRouter>,
    );

    // Vitest defaults `import.meta.env.DEV` to true.
    expect(
      screen.getByRole('button', { name: /developer details/i }),
    ).toBeInTheDocument();
  });
});
