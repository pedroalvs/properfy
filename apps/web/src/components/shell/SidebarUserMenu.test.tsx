import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SidebarUserMenu } from './SidebarUserMenu';

const logout = vi.fn();
const navigate = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    logout,
  }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

describe('SidebarUserMenu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not render language switching actions on mobile', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SidebarUserMenu mobile open />
      </MemoryRouter>,
    );

    expect(screen.getByText('Edit Profile')).toBeInTheDocument();
    expect(screen.getByText('Active Sessions')).toBeInTheDocument();
    expect(screen.queryByText('Change Language')).not.toBeInTheDocument();
  });

  it('links to the security page (active sessions) from the desktop menu', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SidebarUserMenu open />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('Active Sessions'));
    expect(navigate).toHaveBeenCalledWith('/settings/security');
  });

  it('links to the security page (active sessions) from the mobile menu', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SidebarUserMenu mobile open />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('Active Sessions'));
    expect(navigate).toHaveBeenCalledWith('/settings/security');
  });

  it('logs out from mobile menu', () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <SidebarUserMenu mobile open />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByText('Log out of system'));
    expect(logout).toHaveBeenCalled();
  });
});
