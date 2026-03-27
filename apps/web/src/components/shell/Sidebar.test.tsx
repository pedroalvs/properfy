import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Sidebar } from './Sidebar';

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

vi.mock('@/lib/api-error', () => ({
  ApiError: class ApiError extends Error {
    constructor(public status: number, message: string, public code?: string) {
      super(message);
      this.name = 'ApiError';
    }
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

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'usr-99', name: 'Test Admin', email: 'test@test.com', role: 'AM', tenantId: 'tenant-1' },
    token: 'mock-token',
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function renderSidebar(route = '/appointments') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[route]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Sidebar />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderMobileSidebar(route = '/appointments') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter
        initialEntries={[route]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Sidebar mobile />
      </MemoryRouter>
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
    expect(screen.getByLabelText('User menu')).toBeInTheDocument();
  });

  it('renders labels and settings links in mobile mode', () => {
    renderMobileSidebar();
    expect(screen.getByText('Properfy')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Appointments' })).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'menu.editProfile' })).toBeInTheDocument();
  });
});
