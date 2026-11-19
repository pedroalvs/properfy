import { Link } from 'react-router-dom';
import { formatCivilDateLong, greetingFor } from '@/features/day-plan/lib/format-route';
import { formatInstantTime } from '@properfy/shared';

interface TodayHeaderProps {
  firstName: string;
  civilDate: string;
  timezone: string;
  isOnline: boolean;
  queueCount: number;
  done: number;
  total: number;
  finishEta: string | null;
  allDone: boolean;
}

/**
 * Greeting + date/connection line + progress line with a link to the Route.
 * The greeting is derived from the current instant in the plan timezone.
 */
export function TodayHeader({
  firstName,
  civilDate,
  timezone,
  isOnline,
  queueCount,
  done,
  total,
  finishEta,
  allDone,
}: TodayHeaderProps) {
  const greeting = greetingFor(new Date(), timezone);
  const connection = isOnline ? 'Online' : 'Offline';
  const sync = queueCount > 0 ? ` · ${queueCount} waiting to sync` : '';
  const showFinish = total > 0 && !allDone && Boolean(finishEta);

  return (
    <header>
      <h1 className="text-xl font-bold text-foreground">
        {greeting}, {firstName}
      </h1>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {formatCivilDateLong(civilDate)} · {connection}
        {sync}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">
          {done} of {total} done
          {showFinish ? ` · finish ~${formatInstantTime(finishEta, timezone)}` : ''}
        </p>
        <Link to="/today/route" className="text-sm font-semibold text-primary" data-tour="today-route-link">
          Route
        </Link>
      </div>
    </header>
  );
}
