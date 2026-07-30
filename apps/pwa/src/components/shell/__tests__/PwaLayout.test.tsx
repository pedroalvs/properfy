import { screen } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { PwaLayout } from '../PwaLayout';
import { renderWithProviders } from '@/test-utils';

describe('PwaLayout', () => {
  it('renders bottom nav bar', () => {
    renderWithProviders(
      <Routes>
        <Route element={<PwaLayout />}>
          <Route index element={<div>Child content</div>} />
        </Route>
      </Routes>,
    );
    expect(screen.getByTestId('bottom-nav')).toBeInTheDocument();
  });

  it('renders child content via Outlet', () => {
    renderWithProviders(
      <Routes>
        <Route element={<PwaLayout />}>
          <Route index element={<div>Child content</div>} />
        </Route>
      </Routes>,
    );
    expect(screen.getByText('Child content')).toBeInTheDocument();
  });

  it('clears the bottom nav plus the home-indicator inset', () => {
    // The nav is position:fixed, so it does not occupy flow space. The clearance has to
    // cover the bar itself *and* the safe-area inset the bar now pads itself with,
    // otherwise the last row of content sits under the tabs on a notched iPhone.
    const { container } = renderWithProviders(
      <Routes>
        <Route element={<PwaLayout />}>
          <Route index element={<div>Child</div>} />
        </Route>
      </Routes>,
    );
    expect(container.querySelector('main')!.className).toContain('pb-nav-clear');
  });

  it('renders the layout wrapper', () => {
    renderWithProviders(
      <Routes>
        <Route element={<PwaLayout />}>
          <Route index element={<div>Child</div>} />
        </Route>
      </Routes>,
    );
    expect(screen.getByTestId('pwa-layout')).toBeInTheDocument();
  });
});
