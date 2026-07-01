import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthGuard } from '@/app/AuthGuard';
import { UserRole } from '@properfy/shared';

// Route guard is the access control for the reports page. Reports were realigned
// to be AM/OP-only (report.view → [AM, OP]); CL_USER/CL_ADMIN/INSP have no access.

const mockUseAuth = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));
vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showInfo: vi.fn(), showError: vi.fn(), showSuccess: vi.fn() }),
}));

function renderReportsRoute() {
  return render(
    <MemoryRouter
      initialEntries={['/reports']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route
          path="/reports"
          element={
            <AuthGuard roles={[UserRole.AM, UserRole.OP]}>
              <div>Reports Page</div>
            </AuthGuard>
          }
        />
        <Route path="/dashboard" element={<div>Dashboard Redirect</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('reports route guard', () => {
  it('renders the reports page for AM', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-am', name: 'Admin', email: 'am@test.com', role: 'AM', tenantId: null },
      isLoading: false,
    });

    renderReportsRoute();
    expect(screen.getByText('Reports Page')).toBeInTheDocument();
  });

  it('renders the reports page for OP', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-op', name: 'Operator', email: 'op@test.com', role: 'OP', tenantId: null },
      isLoading: false,
    });

    renderReportsRoute();
    expect(screen.getByText('Reports Page')).toBeInTheDocument();
  });

  it('redirects CL_USER to dashboard', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-clu', name: 'Client User', email: 'clu@test.com', role: 'CL_USER', tenantId: 'tenant-1' },
      isLoading: false,
    });

    renderReportsRoute();
    expect(screen.getByText('Dashboard Redirect')).toBeInTheDocument();
    expect(screen.queryByText('Reports Page')).not.toBeInTheDocument();
  });

  it('redirects CL_ADMIN to dashboard', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-cla', name: 'Client Admin', email: 'cla@test.com', role: 'CL_ADMIN', tenantId: 'tenant-1' },
      isLoading: false,
    });

    renderReportsRoute();
    expect(screen.getByText('Dashboard Redirect')).toBeInTheDocument();
    expect(screen.queryByText('Reports Page')).not.toBeInTheDocument();
  });

  it('redirects INSP to dashboard', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-insp', name: 'Inspector', email: 'insp@test.com', role: 'INSP', tenantId: null },
      isLoading: false,
    });

    renderReportsRoute();
    expect(screen.getByText('Dashboard Redirect')).toBeInTheDocument();
    expect(screen.queryByText('Reports Page')).not.toBeInTheDocument();
  });
});
