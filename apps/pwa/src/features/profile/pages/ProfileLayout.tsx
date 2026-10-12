import { Outlet, useMatch } from 'react-router-dom';
import { SlidersHorizontal } from 'lucide-react';
import { EmptyState } from '@/components/feedback/EmptyState';
import { TwoPaneLayout } from '@/components/shell/TwoPaneLayout';
import { ProfilePage } from './ProfilePage';

/**
 * Profile route layout. Phone keeps the validated menu → sub-page stack. At the tablet breakpoint
 * it becomes a 2-column settings pattern — the menu stays on the left while the chosen sub-page
 * (availability / documents / account / settings) renders in the right pane via the nested
 * `<Outlet/>`.
 */
export function ProfileLayout() {
  const hasSelection = useMatch('/profile/:section') !== null;

  return (
    <TwoPaneLayout
      master={<ProfilePage />}
      detail={<Outlet />}
      hasSelection={hasSelection}
      emptyState={
        <EmptyState
          icon={SlidersHorizontal}
          title="Select a setting"
          description="Choose a section to manage your account and app preferences."
        />
      }
    />
  );
}
