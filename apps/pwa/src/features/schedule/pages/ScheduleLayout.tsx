import { Outlet, useMatch } from 'react-router-dom';
import { CalendarDays } from 'lucide-react';
import { EmptyState } from '@/components/feedback/EmptyState';
import { TwoPaneLayout } from '@/components/shell/TwoPaneLayout';
import { SchedulePage } from './SchedulePage';

/**
 * Schedule route layout. On phone it is the validated single-column stack: the list at
 * `/schedule`, the full-screen detail at `/schedule/:appointmentId`. At the tablet breakpoint it
 * becomes a 2-column master-detail — the list stays mounted on the left while the selected
 * appointment renders in the right pane via the nested `<Outlet/>`, so selecting a job swaps the
 * pane without a full navigation (and deep-linking a detail URL still works).
 */
export function ScheduleLayout() {
  const hasSelection = useMatch('/schedule/:appointmentId') !== null;

  return (
    <TwoPaneLayout
      master={<SchedulePage />}
      detail={<Outlet />}
      hasSelection={hasSelection}
      emptyState={
        <EmptyState
          icon={CalendarDays}
          title="Select an appointment"
          description="Pick a job from your schedule to see its details here."
        />
      }
    />
  );
}
