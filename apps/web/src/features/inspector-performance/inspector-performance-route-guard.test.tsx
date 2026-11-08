import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthGuard } from '@/app/AuthGuard';
import { UserRole } from '@properfy/shared';

// Inspector performance is AM/OP only (D4 — agencies and inspectors never see
// reliability scores or rankings). The route guard is the client gate; the
// server (F07-2) enforces the same set. Denied roles are redirected to the
// dashboard with an info toast (the shared AuthGuard behaviour).

const mockUseAuth = vi.fn();
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mockUseAuth() }));
vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showInfo: vi.fn(), showError: vi.fn(), showSuccess: vi.fn() }),
}));

function renderRoute() {
  return render(
    <MemoryRouter
      initialEntries={['/inspector-performance']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route
          path="/inspector-performance"
          element={
            <AuthGuard roles={[UserRole.AM, UserRole.OP]}>
              <div>Inspector Performance Page</div>
            </AuthGuard>
          }
        />
        <Route path="/dashboard" element={<div>Dashboard Redirect</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('inspector-performance route guard', () => {
  it.each(['AM', 'OP'])('renders the page for %s', (role) => {
    mockUseAuth.mockReturnValue({ user: { id: 'u', name: 'User', role, tenantId: null }, isLoading: false });
    renderRoute();
    expect(screen.getByText('Inspector Performance Page')).toBeInTheDocument();
  });

  it.each(['CL_ADMIN', 'CL_USER', 'INSP'])('redirects %s to the dashboard', (role) => {
    mockUseAuth.mockReturnValue({ user: { id: 'u', name: 'User', role, tenantId: 'tenant-1' }, isLoading: false });
    renderRoute();
    expect(screen.getByText('Dashboard Redirect')).toBeInTheDocument();
    expect(screen.queryByText('Inspector Performance Page')).not.toBeInTheDocument();
  });
});
