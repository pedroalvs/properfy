import { StatCard } from './StatCard';
import { toLocalISODate } from '@/lib/format-date';

interface DashboardSummaryCardsProps {
  draft: number;
  awaitingInspector: number;
  scheduled: number;
  doneThisMonth: number;
  doneThisWeek: number;
  scheduledThisWeek: number;
  rejectedTotal: number;
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

function weekRange(): { from: string; to: string } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysSinceMonday = (dayOfWeek + 6) % 7;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    from: toLocalISODate(monday),
    to: toLocalISODate(sunday),
  };
}

export function DashboardSummaryCards({
  draft,
  awaitingInspector,
  scheduled,
  doneThisMonth,
  doneThisWeek,
  scheduledThisWeek,
  rejectedTotal,
  donePendingCrossCheck,
}: DashboardSummaryCardsProps) {
  const today = todayRange();
  const month = monthRange();
  const week = weekRange();

  return (
    <div>
      {/* Row 1 — Current status */}
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
          href={`/appointments?status=SCHEDULED&startDate=${today.from}&endDate=${today.to}`}
        />
        <StatCard
          icon="mdi-close-circle-outline"
          value={rejectedTotal}
          label="Rejected Total"
          colorClass="border-l-[#FFCDD2]"
          iconColorClass="text-error"
          href="/appointments?status=REJECTED"
        />
      </div>

      {/* Row 2 — Temporal performance */}
      <p
        className="text-xs text-text-secondary font-semibold uppercase mt-4 mb-2"
        data-testid="temporal-section-label"
      >
        This period
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          icon="mdi-check-circle-outline"
          value={doneThisWeek}
          label="Done This Week"
          colorClass="border-l-[#A5D6A7]"
          iconColorClass="text-success"
          href={`/appointments?status=DONE&startDate=${week.from}&endDate=${week.to}`}
        />
        <StatCard
          icon="mdi-check-circle-outline"
          value={doneThisMonth}
          label="Done This Month"
          sublabel={donePendingCrossCheck ? `${donePendingCrossCheck} pending review` : undefined}
          colorClass="border-l-[#C8E6C9]"
          iconColorClass="text-success"
          href={`/appointments?status=DONE&startDate=${month.from}&endDate=${month.to}`}
        />
        <StatCard
          icon="mdi-calendar-week"
          value={scheduledThisWeek}
          label="Scheduled This Week"
          colorClass="border-l-[#B3E5FC]"
          iconColorClass="text-info"
          href={`/appointments?status=SCHEDULED&startDate=${week.from}&endDate=${week.to}`}
        />
      </div>
    </div>
  );
}
