import { Outlet, useMatch, useNavigate } from 'react-router-dom';
import { TwoPaneLayout } from '@/components/shell/TwoPaneLayout';
import { SchedulePage } from './SchedulePage';

/**
 * Schedule route layout. On phone it is the validated single-column stack: the list at `/schedule`,
 * the full-screen detail at `/schedule/:appointmentId`. At the tablet breakpoint the list fills the
 * width until an appointment is selected, then the detail expands in from the left (the list stays
 * mounted as a rail on the right); the close control or a back navigation collapses it. Deep-linking a
 * detail URL still opens it directly.
 */
export function ScheduleLayout() {
  const navigate = useNavigate();
  const hasSelection = useMatch('/schedule/:appointmentId') !== null;

  return (
    <TwoPaneLayout
      fillHeight
      master={<SchedulePage />}
      detail={<Outlet />}
      hasSelection={hasSelection}
      onClose={() => navigate('/schedule', { replace: true })}
    />
  );
}
