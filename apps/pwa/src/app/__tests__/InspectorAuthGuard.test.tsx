import { screen } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { InspectorAuthGuard } from '../InspectorAuthGuard';
import { renderWithProviders } from '@/test-utils';

const mockUseAuth = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe('InspectorAuthGuard', () => {
  it('renders children for INSP role', () => {
    mockUseAuth.mockReturnValue({
      user: { id: '1', name: 'Inspector', email: 'insp@test.com', role: 'INSP', tenantId: null },
      isAuthenticated: true,
      isLoading: false,
    });

    renderWithProviders(
      <Routes>
        <Route element={<InspectorAuthGuard />}>
          <Route index element={<div>Protected content</div>} />
        </Route>
      </Routes>,
    );

    expect(screen.getByText('Protected content')).toBeInTheDocument();
  });

  it('redirects non-INSP users to login', () => {
    mockUseAuth.mockReturnValue({
      user: { id: '1', name: 'Admin', email: 'admin@test.com', role: 'AM', tenantId: null },
      isAuthenticated: true,
      isLoading: false,
    });

    renderWithProviders(
      <Routes>
        <Route element={<InspectorAuthGuard />}>
          <Route index element={<div>Protected content</div>} />
        </Route>
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>,
    );

    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });

  it('redirects when user is null', () => {
    mockUseAuth.mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    });

    renderWithProviders(
      <Routes>
        <Route element={<InspectorAuthGuard />}>
          <Route index element={<div>Protected content</div>} />
        </Route>
        <Route path="/login" element={<div>Login page</div>} />
      </Routes>,
    );

    expect(screen.queryByText('Protected content')).not.toBeInTheDocument();
  });
});
