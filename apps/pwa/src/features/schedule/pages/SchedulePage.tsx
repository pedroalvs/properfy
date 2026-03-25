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

  const { data, isLoading, isError, refetch } = useScheduleRange(today, lastDay);
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
    <div data-testid="schedule-page">
      <TopBar title="Schedule" />
      <DaySelectorStrip
        days={days}
        selectedDate={selectedDate}
        onDaySelect={setSelectedDate}
        appointmentCounts={appointmentCounts}
        urgentDays={urgentDays}
      />
      <ScheduleOfflineBanner />

      <PullToRefresh onRefresh={refetch}>
        {isLoading && (
          <div className="px-page-x">
            <LoadingState rows={4} variant="card" />
          </div>
        )}

        {isError && (
          <ErrorState message="Failed to load schedule" onRetry={refetch} />
        )}

        {!isLoading && !isError && (
          <AppointmentDayList appointments={dayAppointments} />
        )}
      </PullToRefresh>
    </div>
  );
}
