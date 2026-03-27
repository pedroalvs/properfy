import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SidebarUserMenu } from './SidebarUserMenu';

const logout = vi.fn();

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    logout,
  }),
}));

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
    expect(screen.getByText('Change Password')).toBeInTheDocument();
    expect(screen.queryByText('Change Language')).not.toBeInTheDocument();
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
