import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthGuard } from './AuthGuard';

const mockUseAuth = vi.fn();
const mockShowInfo = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));
vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showInfo: mockShowInfo, showError: vi.fn(), showSuccess: vi.fn() }),
}));

function renderWithRouter(roles: string[], currentPath = '/protected') {
  return render(
    <MemoryRouter
      initialEntries={[currentPath]}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route
          path="/protected"
          element={
            <AuthGuard roles={roles as any}>
              <div>Protected Content</div>
            </AuthGuard>
          }
        />
        <Route path="/dashboard" element={<div>Dashboard Redirect</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AuthGuard', () => {
  beforeEach(() => {
    mockShowInfo.mockClear();
  });

  it('renders children when user role is allowed', () => {
    mockUseAuth.mockReturnValue({
      user: { id: '1', name: 'Admin', email: 'a@b.com', role: 'AM', tenantId: null },
      isLoading: false,
    });

    renderWithRouter(['AM', 'OP']);
    expect(screen.getByText('Protected Content')).toBeInTheDocument();
  });

  it('redirects to dashboard when user role is not allowed', () => {
    mockUseAuth.mockReturnValue({
      user: { id: '1', name: 'Inspector', email: 'i@b.com', role: 'INSP', tenantId: null },
      isLoading: false,
    });

    renderWithRouter(['AM', 'OP']);
    expect(screen.getByText('Dashboard Redirect')).toBeInTheDocument();
    expect(mockShowInfo).toHaveBeenCalledWith('You do not have permission to access this page');
  });

  it('redirects when user is null', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: false });

    renderWithRouter(['AM']);
    expect(screen.getByText('Dashboard Redirect')).toBeInTheDocument();
    expect(mockShowInfo).toHaveBeenCalledWith('You do not have permission to access this page');
  });

  it('renders loading state while loading', () => {
    mockUseAuth.mockReturnValue({ user: null, isLoading: true });

    renderWithRouter(['AM']);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});
