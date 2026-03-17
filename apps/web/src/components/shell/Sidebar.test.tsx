import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from '@/hooks/useAuth';
import { Sidebar } from './Sidebar';

vi.mock('@/config/env', () => ({
  env: { apiBaseUrl: 'http://localhost:3000' },
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string) { super(message); }
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

function renderSidebar(route = '/appointments') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[route]}>
          <Sidebar />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('Sidebar', () => {
  it('renders navigation items', () => {
    renderSidebar();
    expect(screen.getByLabelText('Appointments')).toBeInTheDocument();
    expect(screen.getByLabelText('Properties')).toBeInTheDocument();
    expect(screen.getByLabelText('Service Groups')).toBeInTheDocument();
    expect(screen.getByLabelText('Financial')).toBeInTheDocument();
    expect(screen.getByLabelText('Reports')).toBeInTheDocument();
  });

  it('renders submenu group for users', () => {
    renderSidebar();
    expect(screen.getByLabelText('Users')).toBeInTheDocument();
  });

  it('marks active item matching current route', () => {
    renderSidebar('/appointments');
    const link = screen.getByLabelText('Appointments');
    expect(link).toHaveClass('sidebar-active');
  });

  it('does not mark non-matching items as active', () => {
    renderSidebar('/appointments');
    const link = screen.getByLabelText('Properties');
    expect(link).not.toHaveClass('sidebar-active');
  });

  it('renders user section at the bottom', () => {
    renderSidebar();
    expect(screen.getByLabelText('Perfil')).toBeInTheDocument();
  });
});
