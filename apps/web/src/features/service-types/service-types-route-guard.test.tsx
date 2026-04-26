import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthGuard } from '@/app/AuthGuard';
import { UserRole } from '@properfy/shared';

// Route guard is the only access control for this management page.
// Backend API (/v1/service-types GET) is open to all authenticated roles;
// management mutations (POST/PATCH) remain AM-only in the backend.

const mockUseAuth = vi.fn();
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
}));

function renderServiceTypesRoute(role: string) {
  return render(
    <MemoryRouter
      initialEntries={['/service-types']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route
          path="/service-types"
          element={
            <AuthGuard roles={[UserRole.AM]}>
              <div>Service Type Management Page</div>
            </AuthGuard>
          }
        />
        <Route path="/dashboard" element={<div>Dashboard Redirect</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('service-types route guard', () => {
  it('renders management page for AM', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-am', name: 'Admin', email: 'am@test.com', role: 'AM', tenantId: null },
      isLoading: false,
    });

    renderServiceTypesRoute('AM');
    expect(screen.getByText('Service Type Management Page')).toBeInTheDocument();
  });

  // Regression: OP must NOT access service-type management.
  // fluxo-operacional.md §2 assigns "Definição de serviços" exclusively to Admin Master.
  // OP previously reached this page due to AuthGuard including UserRole.OP — now removed.
  it('redirects OP to dashboard (service-type management is AM-only)', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-op', name: 'Operator', email: 'op@test.com', role: 'OP', tenantId: null },
      isLoading: false,
    });

    renderServiceTypesRoute('OP');
    expect(screen.getByText('Dashboard Redirect')).toBeInTheDocument();
    expect(screen.queryByText('Service Type Management Page')).not.toBeInTheDocument();
  });

  it('redirects CL_ADMIN to dashboard', () => {
    mockUseAuth.mockReturnValue({
      user: { id: 'user-cl', name: 'Client Admin', email: 'cl@test.com', role: 'CL_ADMIN', tenantId: 'tenant-1' },
      isLoading: false,
    });

    renderServiceTypesRoute('CL_ADMIN');
    expect(screen.getByText('Dashboard Redirect')).toBeInTheDocument();
  });
});
