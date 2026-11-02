import { screen, render } from '@testing-library/react';
import {
  MemoryRouter,
  Outlet,
  useLocation,
  useParams,
  useRoutes,
  type RouteObject,
} from 'react-router-dom';

// Pass-through the auth/shell wrappers so the test exercises routing only.
vi.mock('@/app/ProtectedRoute', () => ({ ProtectedRoute: () => <Outlet /> }));
vi.mock('@/app/InspectorAuthGuard', () => ({ InspectorAuthGuard: () => <Outlet /> }));
vi.mock('@/components/shell/PwaLayout', () => ({ PwaLayout: () => <Outlet /> }));
vi.mock('@/features/today/pages/TodayLayout', () => ({
  TodayLayout: () => (
    <div>
      <span>TodayLayout</span>
      <Outlet />
    </div>
  ),
}));
vi.mock('@/features/day-plan/pages/RoutePage', () => ({
  RoutePage: () => {
    const { date } = useParams();
    return <div>RoutePage:{date ?? 'today'}</div>;
  },
}));
vi.mock('@/features/profile/pages/ProfileLayout', () => ({
  ProfileLayout: () => (
    <div>
      <span>ProfileLayout</span>
      <Outlet />
    </div>
  ),
}));
vi.mock('@/features/profile/pages/ProfileAccountPage', () => ({
  ProfileAccountPage: () => <div>ProfileAccountPage</div>,
}));

// eslint-disable-next-line import/first
import { routes } from '../router';

function LocationProbe() {
  const location = useLocation();
  return (
    <span data-testid="location">
      {location.pathname}
      {location.hash}
    </span>
  );
}

function RoutesFrom() {
  // The route objects are also valid non-data RouteObjects; useRoutes renders
  // element <Navigate> redirects without the data-router AbortSignal path.
  return useRoutes(routes as RouteObject[]);
}

async function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <LocationProbe />
      <RoutesFrom />
    </MemoryRouter>,
  );
}

describe('router', () => {
  it('sends the index to /today', async () => {
    await renderAt('/');
    expect(await screen.findByText('TodayLayout')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/today');
  });

  it('sends an unknown path to /today', async () => {
    await renderAt('/nada');
    expect(await screen.findByText('TodayLayout')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/today');
  });

  it('leaves /profile/account and its hash untouched', async () => {
    await renderAt('/profile/account#base-address');
    expect(await screen.findByText('ProfileAccountPage')).toBeInTheDocument();
    expect(screen.getByTestId('location')).toHaveTextContent('/profile/account#base-address');
  });

  it('renders the Route with the :date param', async () => {
    await renderAt('/today/route/2026-11-05');
    expect(await screen.findByText('RoutePage:2026-11-05')).toBeInTheDocument();
  });

  it('renders the Route with no date at /today/route', async () => {
    await renderAt('/today/route');
    expect(await screen.findByText('RoutePage:today')).toBeInTheDocument();
  });
});
