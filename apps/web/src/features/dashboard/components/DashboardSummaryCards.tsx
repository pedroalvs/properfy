import { StatCard } from './StatCard';
import { toLocalISODate } from '@/lib/format-date';

interface DashboardSummaryCardsProps {
  draft: number;
  awaitingInspector: number;
  scheduled: number;
  doneThisMonth: number;
  donePendingCrossCheck?: number;
}

function todayRange(): { from: string; to: string } {
  const today = toLocalISODate(new Date());
  return { from: today, to: today };
}

function monthRange(): { from: string; to: string } {
  const now = new Date();
  const from = toLocalISODate(new Date(now.getFullYear(), now.getMonth(), 1));
  const to = toLocalISODate(now);
  return { from, to };
}

export function DashboardSummaryCards({
  draft,
  awaitingInspector,
  scheduled,
  doneThisMonth,
  donePendingCrossCheck,
}: DashboardSummaryCardsProps) {
  const today = todayRange();
  const month = monthRange();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        icon="mdi-file-edit-outline"
        value={draft}
        label="Draft"
        colorClass="border-l-[#E1BEE7]"
        iconColorClass="text-[#CE93D8]"
        href="/appointments?status=DRAFT"
      />
      <StatCard
        icon="mdi-clock-outline"
        value={awaitingInspector}
        label="Awaiting Inspector"
        colorClass="border-l-[#FFE0B2]"
        iconColorClass="text-warning"
        href="/appointments?status=AWAITING_INSPECTOR"
      />
      <StatCard
        icon="mdi-calendar-check"
        value={scheduled}
        label="Scheduled"
        colorClass="border-l-[#B3E5FC]"
        iconColorClass="text-info"
        href={`/appointments?status=SCHEDULED&fromDate=${today.from}&toDate=${today.to}`}
      />
      <StatCard
        icon="mdi-check-circle-outline"
        value={doneThisMonth}
        label="Done This Month"
        sublabel={donePendingCrossCheck ? `${donePendingCrossCheck} pending review` : undefined}
        colorClass="border-l-[#C8E6C9]"
        iconColorClass="text-success"
        href={`/appointments?status=DONE&fromDate=${month.from}&toDate=${month.to}`}
      />
    </div>
  );
}
