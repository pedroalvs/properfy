import { Outlet, useMatch, useNavigate } from 'react-router-dom';
import { TwoPaneLayout } from '@/components/shell/TwoPaneLayout';
import { TodayPage } from './TodayPage';

/**
 * Today route layout. On phone it is the single-column stack: the Today screen at
 * `/today`, the full-screen Route at `/today/route[/:date]`. At the tablet
 * breakpoint the Today screen fills the width until the Route is opened, then the
 * Route expands in from the left (Today stays as a rail on the right). Each pane
 * scrolls on its own (`fillHeight`).
 */
export function TodayLayout() {
  const navigate = useNavigate();
  const hasSelection = useMatch('/today/route/*') !== null;

  return (
    <TwoPaneLayout
      fillHeight
      master={<TodayPage />}
      detail={<Outlet />}
      hasSelection={hasSelection}
      onClose={() => navigate('/today', { replace: true })}
    />
  );
}
