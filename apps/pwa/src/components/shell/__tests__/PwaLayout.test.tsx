import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from '@/hooks/useSnackbar';
import { createTestQueryClient } from '@/test-utils';
import { PwaLayout } from '../PwaLayout';

const mockHeartbeat = vi.fn();
vi.mock('@/app/useAppStateHeartbeat', () => ({
  useAppStateHeartbeat: () => mockHeartbeat(),
}));

/**
 * PwaLayout reads `useMatches()`, which React Router only supports under a data router — it throws
 * under <Routes>/MemoryRouter. So these render it via createMemoryRouter + RouterProvider (the same
 * pattern the web AppShell tests use), which is also the only way to express a route `handle`.
 */
function renderLayout(child: RouteObject = { index: true, element: <div>Child content</div> }) {
  const router = createMemoryRouter(
    [{ element: <PwaLayout />, children: [child] }],
    { future: { v7_relativeSplatPath: true } },
  );
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <SnackbarProvider>
        <RouterProvider router={router} future={{ v7_startTransition: true }} />
      </SnackbarProvider>
    </QueryClientProvider>,
  );
}

describe('PwaLayout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invokes the app-state heartbeat once per mount', () => {
    renderLayout();
    expect(mockHeartbeat).toHaveBeenCalledTimes(1);
  });

  it('renders bottom nav bar', () => {
    renderLayout();
    expect(screen.getByTestId('bottom-nav')).toBeInTheDocument();
  });

  it('renders child content via Outlet', () => {
    renderLayout();
    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('clears the bottom nav plus the home-indicator inset', () => {
    // The nav is position:fixed, so it does not occupy flow space. The clearance has to
    // cover the bar itself *and* the safe-area inset the bar now pads itself with,
    // otherwise the last row of content sits under the tabs on a notched iPhone.
    const { container } = renderLayout();
    expect(container.querySelector('main')!.className).toContain('pb-nav-clear');
  });

  it('renders the layout wrapper', () => {
    renderLayout();
    expect(screen.getByTestId('pwa-layout')).toBeInTheDocument();
  });

  it('sizes the frame with 100dvh so mobile browser chrome does not push content', () => {
    // `min-h-screen` (100vh) is the LARGEST viewport (address bar hidden); dvh tracks
    // the visible height so the layout does not jump when the bar collapses.
    renderLayout();
    const wrapper = screen.getByTestId('pwa-layout');
    expect(wrapper.className).toContain('min-h-[100dvh]');
    expect(wrapper.className).not.toContain('min-h-screen');
  });

  it('caps content at the single-column phone width by default', () => {
    const { container } = renderLayout();
    const main = container.querySelector('main')!;
    expect(main.className).toContain('max-w-screen-sm');
    expect(main.className).not.toContain('md:max-w-screen-lg');
    expect(main.getAttribute('data-wide')).toBeNull();
  });

  it('lifts the cap on a wide route (2-column screens) only at the md breakpoint', () => {
    const { container } = renderLayout({
      index: true,
      element: <div>Wide child</div>,
      handle: { wide: true },
    });
    const main = container.querySelector('main')!;
    // Phone cap stays 640 (max-w-screen-sm); the wider cap is gated behind md:.
    expect(main.className).toContain('max-w-screen-sm');
    expect(main.className).toContain('md:max-w-screen-lg');
    expect(main.getAttribute('data-wide')).toBe('true');
  });
});
