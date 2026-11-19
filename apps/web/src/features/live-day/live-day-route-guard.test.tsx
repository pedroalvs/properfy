import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthGuard } from '@/app/AuthGuard';
import { UserRole } from '@properfy/shared';

// Live Day is AM/OP only (inspectors are cross-tenant, like Workload). The route
// guard is the client gate; the server enforces the same set.

const mockUseAuth = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));
vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showInfo: vi.fn(), showError: vi.fn(), showSuccess: vi.fn() }),
}));

function renderLiveDayRoute() {
  return render(
    <MemoryRouter initialEntries={['/live-day']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route
          path="/live-day"
          element={
            <AuthGuard roles={[UserRole.AM, UserRole.OP]}>
              <div>Live Day Page</div>
            </AuthGuard>
          }
        />
        <Route path="/dashboard" element={<div>Dashboard Redirect</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('live-day route guard', () => {
  it('renders the page for OP', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u-op', name: 'Operator', email: 'op@test.com', role: 'OP', tenantId: null },
      isLoading: false,
    });
    renderLiveDayRoute();
    expect(screen.getByText('Live Day Page')).toBeInTheDocument();
  });

  it('renders the page for AM', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u-am', name: 'Admin', email: 'am@test.com', role: 'AM', tenantId: null },
      isLoading: false,
    });
    renderLiveDayRoute();
    expect(screen.getByText('Live Day Page')).toBeInTheDocument();
  });

  it('redirects CL_ADMIN to the dashboard', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u-cl', name: 'Client Admin', email: 'cl@test.com', role: 'CL_ADMIN', tenantId: 'tenant-1' },
      isLoading: false,
    });
    renderLiveDayRoute();
    expect(screen.getByText('Dashboard Redirect')).toBeInTheDocument();
    expect(screen.queryByText('Live Day Page')).not.toBeInTheDocument();
  });

  it('redirects INSP to the dashboard', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'u-insp', name: 'Inspector', email: 'insp@test.com', role: 'INSP', tenantId: 'tenant-1' },
      isLoading: false,
    });
    renderLiveDayRoute();
    expect(screen.getByText('Dashboard Redirect')).toBeInTheDocument();
  });
});
