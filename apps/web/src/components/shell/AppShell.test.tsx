import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/useAuth';
import { AppShell } from './AppShell';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/services/api', () => ({
  api: {
    GET: vi.fn(),
    POST: vi.fn(),
    PATCH: vi.fn(),
    PUT: vi.fn(),
    DELETE: vi.fn(),
  },
}));

vi.mock('@/lib/auth-storage', () => ({
  authStorage: {
    getAccessToken: vi.fn(() => null),
    hasTokens: vi.fn(() => false),
    setTokens: vi.fn(),
    clearTokens: vi.fn(),
  },
}));

// A data router (createMemoryRouter) is required here: AppShell reads the
// full-height flag via `useMatches()`, which throws outside a data router, and
// route `handle` objects can only be expressed on a route definition.
function renderWithRouter(route = '/appointments') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const router = createMemoryRouter(
    [
      {
        element: <AppShell />,
        children: [
          { path: 'appointments', element: <div>Appointments Content</div> },
          {
            path: 'map',
            element: <div>Map Content</div>,
            handle: { fullHeight: true },
          },
        ],
      },
    ],
    {
      initialEntries: [route],
      future: { v7_relativeSplatPath: true },
    },
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} future={{ v7_startTransition: true }} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('AppShell', () => {
  it('renders sidebar and main content area', () => {
    renderWithRouter();
    expect(screen.getAllByTestId('sidebar').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId('main-content')).toBeInTheDocument();
  });

  it('renders child route content in main area', () => {
    renderWithRouter();
    expect(screen.getByText('Appointments Content')).toBeInTheDocument();
  });

  describe('full-height routes', () => {
    // Regression guard: the map screen scrolled because <main> only had
    // `min-h-screen` (a floor that grows) while the content wrapper added
    // px-4 py-2 / md:px-8 md:py-6 around a 100vh child, pushing the document
    // past the viewport.
    it('clamps main to the viewport on a route with handle.fullHeight', () => {
      renderWithRouter('/map');
      const main = screen.getByTestId('main-content');
      // `h-dvh`, not `h-screen`: on mobile Safari/Chrome 100vh is the URL-bar-
      // collapsed height, so it exceeds the visible viewport while the bar is
      // expanded and leaves a residual scroll. `dvh` tracks the live viewport.
      expect(main).toHaveClass('h-dvh');
      expect(main).not.toHaveClass('h-screen');
      expect(main).toHaveClass('overflow-hidden');
      expect(main).toHaveClass('flex');
      expect(main).toHaveClass('flex-col');
      expect(main).not.toHaveClass('min-h-screen');
    });

    it('drops the content padding on a route with handle.fullHeight', () => {
      renderWithRouter('/map');
      const inner = screen.getByTestId('main-content-inner');
      expect(inner).toHaveClass('flex-1');
      expect(inner).toHaveClass('min-h-0');
      expect(inner).not.toHaveClass('py-2');
      expect(inner).not.toHaveClass('md:py-6');
    });

    it('keeps the growing layout and padding on ordinary routes', () => {
      renderWithRouter('/appointments');
      const main = screen.getByTestId('main-content');
      expect(main).toHaveClass('min-h-screen');
      expect(main).not.toHaveClass('h-screen');
      expect(main).not.toHaveClass('h-dvh');
      expect(main).not.toHaveClass('overflow-hidden');

      const inner = screen.getByTestId('main-content-inner');
      expect(inner).toHaveClass('px-4');
      expect(inner).toHaveClass('py-2');
      expect(inner).toHaveClass('md:px-8');
      expect(inner).toHaveClass('md:py-6');
    });
  });
});
