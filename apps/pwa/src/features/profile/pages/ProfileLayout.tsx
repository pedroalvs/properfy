import { Outlet, useMatch, useNavigate } from 'react-router-dom';
import { TwoPaneLayout } from '@/components/shell/TwoPaneLayout';
import { ProfilePage } from './ProfilePage';

/**
 * Profile route layout. Phone keeps the validated menu → sub-page stack. At the tablet breakpoint the
 * menu fills the width until a section is chosen, then the sub-page expands in from the left (the menu
 * stays mounted as a rail on the right); the close control or a back navigation collapses it.
 */
export function ProfileLayout() {
  const navigate = useNavigate();
  const hasSelection = useMatch('/profile/:section') !== null;

  return (
    <TwoPaneLayout
      master={<ProfilePage />}
      detail={<Outlet />}
      hasSelection={hasSelection}
      onClose={() => navigate('/profile')}
      // The sub-page's own TopBar back chevron closes the pane; omit the frame's floating close so
      // it doesn't overlap the TopBar's right-side indicators.
      showClose={false}
    />
  );
}
