import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TopBar } from '@/components/shell/TopBar';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { DaySelectorStrip } from '../components/DaySelectorStrip';
import { AppointmentDayList } from '../components/AppointmentDayList';
import { AppointmentCard } from '../components/AppointmentCard';
import { ScheduleOfflineBanner } from '../components/ScheduleOfflineBanner';
import { ScheduleTabs } from '../components/ScheduleTabs';
import { ScheduleHistoryList } from '../components/ScheduleHistoryList';
import { InstallBannerNative } from '../components/InstallBannerNative';
import { InstallBannerIos } from '../components/InstallBannerIos';
import { useInstallPrompt } from '@/app/useInstallPrompt';
import { useScheduleRange } from '../hooks/useScheduleRange';
import { useScheduleDay } from '../hooks/useScheduleDay';
import { useScheduleHistory } from '../hooks/useScheduleHistory';
import { isScheduleRisk, toLocalISODate, formatScheduleDate } from '../lib/time-slot';

type Tab = 'upcoming' | 'history';

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

function pastDate(daysBack: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return toLocalISODate(d);
}

export function SchedulePage() {
  const [searchParams] = useSearchParams();
  const days = useMemo(() => generateDays(60), []);
  const today = days[0]!;
  const lastDay = days[days.length - 1]!;
  const lookbackStart = useMemo(() => pastDate(7), []);
  const initialDate = useMemo(() => {
    const param = searchParams.get('date');
    if (param && days.includes(param)) return param;
    return today;
  }, [searchParams, days, today]);
  const [selectedDate, setSelectedDate] = useState(initialDate);

  const [tab, setTab] = useState<Tab>('upcoming');
  const { isIosSafariEligible, canInstall } = useInstallPrompt();

  const { data, isLoading, isError, error, refetch } = useScheduleRange(lookbackStart, lastDay);
  const dayAppointments = useScheduleDay(data?.appointments, selectedDate);
  const history = useScheduleHistory();

  const appointmentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const apt of data?.appointments ?? []) {
      counts[apt.scheduledDate] = (counts[apt.scheduledDate] ?? 0) + 1;
    }
    return counts;
  }, [data?.appointments]);

  const urgentDays = useMemo(() => {
    const set = new Set<string>();
    for (const apt of data?.appointments ?? []) {
      if (isScheduleRisk(apt) || apt.isOverdue) {
        set.add(apt.scheduledDate);
      }
    }
    return set;
  }, [data?.appointments]);

  const isToday = selectedDate === today;
  const dayCount = appointmentCounts[selectedDate] ?? 0;
  const dayLabel = isToday ? 'Today' : formatScheduleDate(selectedDate);

  const stuckAppointments = useMemo(() => {
    if (!isToday) return [];
    return (data?.appointments ?? []).filter(
      (apt) => apt.scheduledDate < today && apt.status === 'SCHEDULED',
    );
  }, [data?.appointments, today, isToday]);

  const overdueCount = useMemo(() => {
    return dayAppointments.filter((apt) => apt.isOverdue).length;
  }, [dayAppointments]);

  const riskCount = useMemo(() => {
    return dayAppointments.filter((apt) => isScheduleRisk(apt)).length;
  }, [dayAppointments]);

  return (
    <div className="w-full" data-testid="schedule-page">
      <TopBar title="Schedule" />
      <div className="px-page-x py-4">
        <section className="rounded-[28px] bg-[linear-gradient(135deg,_rgba(30,64,175,0.96),_rgba(37,99,235,0.78))] px-5 py-5 text-white shadow-[0_20px_50px_rgba(30,64,175,0.22)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70">
            {dayLabel}
          </p>
          <div className="mt-2 flex items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">
                {dayCount === 0
                  ? 'No appointments'
                  : `${dayCount} ${dayCount === 1 ? 'appointment' : 'appointments'}`}
              </h2>
              {overdueCount > 0 ? (
                <p className="mt-1 text-sm text-red-200">
                  <i className="mdi mdi-clock-alert-outline mr-1" />
                  {overdueCount} overdue — attend to these first.
                </p>
              ) : riskCount > 0 ? (
                <p className="mt-1 text-sm text-yellow-200">
                  <i className="mdi mdi-alert-outline mr-1" />
                  {riskCount} {riskCount === 1 ? 'requires' : 'require'} tenant confirmation.
                </p>
              ) : dayCount > 0 ? (
                <p className="mt-1 text-sm text-white/70">All clear — plan your route.</p>
              ) : (
                <p className="mt-1 text-sm text-white/70">No work scheduled for this day.</p>
              )}
            </div>
            {dayCount > 0 && (
              <div className="shrink-0 rounded-2xl bg-white/14 px-3 py-2 text-center">
                <p className="text-2xl font-bold leading-none">{dayCount}</p>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-white/70">
                  {dayCount === 1 ? 'job' : 'jobs'}
                </p>
              </div>
            )}
          </div>
        </section>
      </div>

      {isIosSafariEligible ? <InstallBannerIos /> : canInstall ? <InstallBannerNative /> : null}

      <ScheduleTabs value={tab} onChange={setTab} />

      {tab === 'upcoming' && (
        <>
          <DaySelectorStrip
            days={days}
            selectedDate={selectedDate}
            onDaySelect={setSelectedDate}
            appointmentCounts={appointmentCounts}
            urgentDays={urgentDays}
          />

          <div className="px-page-x pt-1">
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

              {!isLoading && !isError && stuckAppointments.length > 0 && (
                <div className="mb-4 px-page-x">
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-800">
                      <i className="mdi mdi-clock-alert-outline text-base" />
                      {stuckAppointments.length} incomplete {stuckAppointments.length === 1 ? 'job' : 'jobs'} from previous days
                    </p>
                    <div className="flex flex-col gap-2">
                      {stuckAppointments.map((apt) => (
                        <AppointmentCard key={apt.id} appointment={apt} />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {!isLoading && !isError && (
                <AppointmentDayList appointments={dayAppointments} />
              )}
            </div>
          </PullToRefresh>
        </>
      )}

      {tab === 'history' && (
        <div className="pb-6 pt-2">
          {history.isLoading && (
            <div className="px-page-x">
              <LoadingState rows={4} variant="card" />
            </div>
          )}
          {history.isError && (
            <ErrorState
              message="Failed to load history"
              detail={history.error instanceof Error ? history.error.message : undefined}
              onRetry={history.refetch}
            />
          )}
          {!history.isLoading && !history.isError && (
            <ScheduleHistoryList items={history.data?.items ?? []} />
          )}
        </div>
      )}
    </div>
  );
}
