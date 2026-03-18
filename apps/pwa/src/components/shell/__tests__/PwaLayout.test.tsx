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
