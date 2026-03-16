import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '@/hooks/useAuth';
import { Sidebar } from './Sidebar';

function renderSidebar(route = '/appointments') {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[route]}>
        <Sidebar />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe('Sidebar', () => {
  it('renders navigation items', () => {
    renderSidebar();

    expect(screen.getByLabelText('Vistorias')).toBeInTheDocument();
    expect(screen.getByLabelText('Imóveis')).toBeInTheDocument();
    expect(screen.getByLabelText('Grupos')).toBeInTheDocument();
    expect(screen.getByLabelText('Financeiro')).toBeInTheDocument();
    expect(screen.getByLabelText('Relatórios')).toBeInTheDocument();
  });

  it('renders submenu group for users', () => {
    renderSidebar();

    expect(screen.getByLabelText('Usuários')).toBeInTheDocument();
  });

  it('marks active item matching current route', () => {
    renderSidebar('/appointments');

    const link = screen.getByLabelText('Vistorias');
    expect(link).toHaveClass('sidebar-active');
  });

  it('does not mark non-matching items as active', () => {
    renderSidebar('/appointments');

    const link = screen.getByLabelText('Imóveis');
    expect(link).not.toHaveClass('sidebar-active');
  });

  it('renders user section at the bottom', () => {
    renderSidebar();

    expect(screen.getByLabelText('Perfil')).toBeInTheDocument();
  });
});
