import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthGuard } from '@/app/AuthGuard';
import { UserRole } from '@properfy/shared';

// Goals & rewards is the platform-scoped inspector program (D12); AM/OP only
// (Q18 — agencies and inspectors never see it). The route guard is the client
// gate; the server enforces the same set. Denied roles are redirected to the
// dashboard (the shared AuthGuard behaviour). Covers all three routes.

const mockUseAuth = vi.fn();
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => mockUseAuth() }));
vi.mock('@/hooks/useSnackbar', () => ({
  useSnackbar: () => ({ showInfo: vi.fn(), showError: vi.fn(), showSuccess: vi.fn() }),
}));

function renderRoute(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route
          path="/goals-rewards"
          element={
            <AuthGuard roles={[UserRole.AM, UserRole.OP]}>
              <div>Goals &amp; Rewards Page</div>
            </AuthGuard>
          }
        />
        <Route
          path="/goals-rewards/goals/new"
          element={
            <AuthGuard roles={[UserRole.AM, UserRole.OP]}>
              <div>Goal Form (new)</div>
            </AuthGuard>
          }
        />
        <Route
          path="/goals-rewards/goals/:goalId"
          element={
            <AuthGuard roles={[UserRole.AM, UserRole.OP]}>
              <div>Goal Form (edit)</div>
            </AuthGuard>
          }
        />
        <Route path="/dashboard" element={<div>Dashboard Redirect</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const ROUTES: Array<[string, string]> = [
  ['/goals-rewards', 'Goals & Rewards Page'],
  ['/goals-rewards/goals/new', 'Goal Form (new)'],
  ['/goals-rewards/goals/abc-123', 'Goal Form (edit)'],
];

describe('goals-rewards route guard', () => {
  describe.each(ROUTES)('%s', (entry, visible) => {
    it.each(['AM', 'OP'])('renders for %s', (role) => {
      mockUseAuth.mockReturnValue({ user: { id: 'u', name: 'User', role, tenantId: null }, isLoading: false });
      renderRoute(entry);
      expect(screen.getByText(visible)).toBeInTheDocument();
    });

    it.each(['CL_ADMIN', 'CL_USER', 'INSP'])('redirects %s to the dashboard', (role) => {
      mockUseAuth.mockReturnValue({ user: { id: 'u', name: 'User', role, tenantId: 'tenant-1' }, isLoading: false });
      renderRoute(entry);
      expect(screen.getByText('Dashboard Redirect')).toBeInTheDocument();
      expect(screen.queryByText(visible)).not.toBeInTheDocument();
    });
  });
});
