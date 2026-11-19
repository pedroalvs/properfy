import type { DayPlanStop } from '@properfy/shared';
import { StopCard } from '@/features/day-plan/components/StopCard';
import { AppointmentActionBar } from '@/features/execution/components/AppointmentActionBar';
import { stopToActionTarget } from '@/features/day-plan/lib/stop-to-action-target';

interface NextInspectionCardProps {
  stop: DayPlanStop;
  /** The plan's civil date; the action bar's day gate compares against today. */
  planDate: string;
  /** Whether the plan is for today (enables Check in / Running late). */
  isToday: boolean;
}

/** The Today screen's hero: the next stop as a `next` StopCard with the F03 action bar. */
export function NextInspectionCard({ stop, planDate, isToday }: NextInspectionCardProps) {
  return (
    <div data-tour="today-next">
      <StopCard
        variant="next"
        stop={stop}
        actions={
          <div data-tour="today-next-actions">
            <AppointmentActionBar target={stopToActionTarget(stop, planDate)} isToday={isToday} />
          </div>
        }
      />
    </div>
  );
}
