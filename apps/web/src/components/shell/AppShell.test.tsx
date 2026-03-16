import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/hooks/useAuth';
import { AppShell } from './AppShell';

function renderWithRouter(route = '/appointments') {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="appointments" element={<div>Appointments Content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('AppShell', () => {
  it('renders sidebar and main content area', () => {
    renderWithRouter();

    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('main-content')).toBeInTheDocument();
  });

  it('renders child route content in main area', () => {
    renderWithRouter();

    expect(screen.getByText('Appointments Content')).toBeInTheDocument();
  });
});
