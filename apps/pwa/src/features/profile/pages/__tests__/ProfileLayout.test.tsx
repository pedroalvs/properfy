import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import { ProfileLayout } from '../ProfileLayout';

vi.mock('../ProfilePage', () => ({
  ProfilePage: () => <div data-testid="profile-master">menu</div>,
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderAt(path: string) {
  const routes: RouteObject[] = [
    {
      path: 'profile',
      element: <ProfileLayout />,
      children: [
        { index: true, element: null },
        { path: 'account', element: <div data-testid="profile-account">account</div> },
      ],
    },
  ];
  const router = createMemoryRouter(routes, {
    initialEntries: [path],
    future: { v7_relativeSplatPath: true },
  });
  return render(<RouterProvider router={router} future={{ v7_startTransition: true }} />);
}

describe('ProfileLayout', () => {
  it('shows only the menu master (collapsed detail) at /profile', () => {
    renderAt('/profile');
    expect(screen.getByTestId('profile-master')).toBeInTheDocument();
    expect(screen.queryByTestId('profile-account')).not.toBeInTheDocument();
    expect(screen.getByTestId('two-pane-detail').className).toContain('md:w-0');
  });

  it('keeps the menu mounted and expands the sub-page at /profile/:section', () => {
    renderAt('/profile/account');
    expect(screen.getByTestId('profile-master')).toBeInTheDocument();
    expect(screen.getByTestId('profile-account')).toBeInTheDocument();
    expect(screen.getByTestId('two-pane-detail').className).toContain('md:w-[58%]');
  });

  it('omits the frame close — the sub-page TopBar back closes the pane', () => {
    renderAt('/profile/account');
    expect(screen.queryByTestId('two-pane-close')).not.toBeInTheDocument();
    expect(screen.getByTestId('profile-account')).toBeInTheDocument();
  });
});
