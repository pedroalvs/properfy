import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom';
import { ProfileLayout } from '../ProfileLayout';

vi.mock('../ProfilePage', () => ({
  ProfilePage: () => <div data-testid="profile-master">menu</div>,
}));

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
  it('shows the menu master and the empty-state pane at /profile', () => {
    renderAt('/profile');
    expect(screen.getByTestId('profile-master')).toBeInTheDocument();
    expect(screen.getByText('Select a setting')).toBeInTheDocument();
    expect(screen.queryByTestId('profile-account')).not.toBeInTheDocument();
  });

  it('keeps the menu mounted and renders the sub-page at /profile/:section', () => {
    renderAt('/profile/account');
    expect(screen.getByTestId('profile-master')).toBeInTheDocument();
    expect(screen.getByTestId('profile-account')).toBeInTheDocument();
    expect(screen.queryByText('Select a setting')).not.toBeInTheDocument();
  });
});
