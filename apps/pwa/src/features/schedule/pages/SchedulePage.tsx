import { useState, useMemo } from 'react';
import { TopBar } from '@/components/shell/TopBar';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { DaySelectorStrip } from '../components/DaySelectorStrip';
import { AppointmentDayList } from '../components/AppointmentDayList';
import { ScheduleOfflineBanner } from '../components/ScheduleOfflineBanner';
import { useScheduleRange } from '../hooks/useScheduleRange';
import { useScheduleDay } from '../hooks/useScheduleDay';
import { isScheduleRisk, toLocalISODate } from '../lib/time-slot';

function generateDays(count: number): string[] {
  const days: string[] = [];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    days.push(toLocalISODate(d));
  }
  return days;
}

export function SchedulePage() {
  const days = useMemo(() => generateDays(14), []);
  const today = days[0]!;
  const lastDay = days[days.length - 1]!;
  const [selectedDate, setSelectedDate] = useState(today);

  const { data, isLoading, isError, error, refetch } = useScheduleRange(today, lastDay);
  const dayAppointments = useScheduleDay(data?.appointments, selectedDate);

  const appointmentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const apt of data?.appointments ?? []) {
      counts[apt.scheduledDate] = (counts[apt.scheduledDate] ?? 0) + 1;
    }
    return counts;
  }, [data?.appointments]);

  const urgentDays = useMemo(() => {
    const days = new Set<string>();
    for (const apt of data?.appointments ?? []) {
      if (isScheduleRisk(apt)) {
        days.add(apt.scheduledDate);
      }
    }
    return days;
  }, [data?.appointments]);

  return (
    <div className="w-full" data-testid="schedule-page">
      <TopBar title="Schedule" />
      <div className="px-page-x py-4">
        <section className="rounded-[28px] bg-[linear-gradient(135deg,_rgba(30,64,175,0.96),_rgba(37,99,235,0.78))] px-5 py-5 text-white shadow-[0_20px_50px_rgba(30,64,175,0.22)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">Field overview</p>
          <div className="mt-3 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">
                {appointmentCounts[selectedDate] ?? 0} appointments
              </h2>
              <p className="mt-1 text-sm text-white/80">Plan your day, confirm risks and start on time.</p>
            </div>
            <div className="rounded-2xl bg-white/14 px-3 py-2 text-right">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">Selected day</p>
              <p className="mt-1 text-sm font-semibold">{selectedDate}</p>
            </div>
          </div>
        </section>
      </div>

      <DaySelectorStrip
        days={days}
        selectedDate={selectedDate}
        onDaySelect={setSelectedDate}
        appointmentCounts={appointmentCounts}
        urgentDays={urgentDays}
      />
      <div className="px-page-x pt-3">
        <ScheduleOfflineBanner />
      </div>

      <PullToRefresh onRefresh={refetch}>
        <div className="pb-6 pt-3">
          {isLoading && (
            <div className="px-page-x">
              <LoadingState rows={4} variant="card" />
            </div>
          )}

          {isError && (
            <ErrorState
              message="Failed to load schedule"
              detail={error instanceof Error ? error.message : undefined}
              onRetry={refetch}
            />
          )}

          {!isLoading && !isError && (
            <AppointmentDayList appointments={dayAppointments} />
          )}
        </div>
      </PullToRefresh>
    </div>
  );
}
