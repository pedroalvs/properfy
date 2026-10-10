import { useEffect, useState, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { TopBar } from '@/components/shell/TopBar';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ErrorState } from '@/components/feedback/ErrorState';
import { PullToRefresh } from '@/components/ui/PullToRefresh';
import { DaySelectorStrip } from '../components/DaySelectorStrip';
import { AppointmentDayList } from '../components/AppointmentDayList';
import { AppointmentCard } from '../components/AppointmentCard';
import { ScheduleOfflineBanner } from '../components/ScheduleOfflineBanner';
import { FailedSyncBanner } from '@/features/execution/components/FailedSyncBanner';
import { ScheduleTabs } from '../components/ScheduleTabs';
import { ScheduleHistoryList } from '../components/ScheduleHistoryList';
import { InstallBannerNative } from '../components/InstallBannerNative';
import { InstallBannerIos } from '../components/InstallBannerIos';
import { useInstallPrompt } from '@/app/useInstallPrompt';
import { useScheduleMonth } from '../hooks/useScheduleMonth';
import { useScheduleDay } from '../hooks/useScheduleDay';
import { useScheduleHistory, type HistoryPeriod } from '../hooks/useScheduleHistory';
import { todayInTzDateString, RentalTenantConfirmationStatus } from '@properfy/shared';
import { cn } from '@properfy/frontend-standards';
import { AlertCircle, AlertTriangle } from 'lucide-react';
import { Card, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { useEffectiveTimezone } from '@/hooks/useEffectiveTimezone';
import { isScheduleRisk, formatScheduleDate } from '../lib/time-slot';

type Tab = 'upcoming' | 'history';

export function SchedulePage() {
  const [searchParams] = useSearchParams();
  const timeZone = useEffectiveTimezone();
  const effectiveToday = useMemo(() => todayInTzDateString(timeZone), [timeZone]);
  const initialDate = useMemo(() => {
    const param = searchParams.get('date');
    if (param) return param;
    return effectiveToday;
  }, [searchParams, effectiveToday]);
  const [selectedDate, setSelectedDate] = useState(initialDate);

  const [tab, setTab] = useState<Tab>('upcoming');
  const { isIosSafariEligible, canInstall } = useInstallPrompt();

  const { data, isLoading, isError, error, refetch } = useScheduleMonth();
  const today = data?.today ?? effectiveToday;
  const days = useMemo(() => data?.days.map((day) => day.date) ?? [today], [data?.days, today]);
  const dayAppointments = useScheduleDay(data?.appointments, selectedDate);
  const [historyPeriod, setHistoryPeriod] = useState<HistoryPeriod>('24m');
  const history = useScheduleHistory(historyPeriod, tab === 'history');

  // Infinite scroll: fetch the next history page when the sentinel enters the viewport.
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = history;
  const historySentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = historySentinelRef.current;
    if (tab !== 'history' || !el || !hasNextPage || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((observed) => {
      if (observed.some((e) => e.isIntersecting)) void fetchNextPage();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [tab, hasNextPage, fetchNextPage, history.items.length]);

  useEffect(() => {
    if (!data?.days.length) return;
    const hasSelectedDate = data.days.some((day) => day.date === selectedDate);
    if (!hasSelectedDate) {
      setSelectedDate(data.today);
    }
  }, [data?.days, data?.today, selectedDate]);

  const appointmentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const day of data?.days ?? []) {
      counts[day.date] = day.count;
    }
    return counts;
  }, [data?.days]);

  const urgentDays = useMemo(() => {
    const set = new Set<string>();
    for (const day of data?.days ?? []) {
      if (day.hasUrgent) set.add(day.date);
    }
    return set;
  }, [data?.days]);

  const isToday = selectedDate === today;
  const overdueAppointments = useMemo(
    () => data?.overdueAppointments ?? [],
    [data?.overdueAppointments],
  );
  const overdueCount = isToday ? overdueAppointments.length : 0;
  const dayCount = (appointmentCounts[selectedDate] ?? 0) + overdueCount;
  const dayLabel = isToday ? 'Today' : formatScheduleDate(selectedDate);

  const stuckAppointments = useMemo(() => {
    if (!isToday) return [];
    return overdueAppointments;
  }, [overdueAppointments, isToday]);

  const riskCount = useMemo(() => {
    return dayAppointments.filter((apt) => isScheduleRisk(apt)).length;
  }, [dayAppointments]);

  const confirmationCounts = useMemo(() => {
    let confirmed = 0;
    let awaiting = 0;
    for (const apt of dayAppointments) {
      if (apt.rentalTenantConfirmation === RentalTenantConfirmationStatus.CONFIRMED) {
        confirmed += 1;
      } else if (
        apt.rentalTenantConfirmation === RentalTenantConfirmationStatus.PENDING ||
        apt.rentalTenantConfirmation === RentalTenantConfirmationStatus.NO_RESPONSE
      ) {
        awaiting += 1;
      }
    }
    return { confirmed, awaiting };
  }, [dayAppointments]);

  return (
    <div className="w-full" data-testid="schedule-page">
      <TopBar title="Schedule" />
      <div className="px-page-x py-4">
        <Card>
          <div className="flex items-start justify-between gap-4">
            <CardTitle className="text-[20px] leading-tight">{dayLabel}</CardTitle>
            <span className="shrink-0 text-sm font-semibold text-muted-foreground">
              {dayCount === 0 ? 'No jobs' : `${dayCount} ${dayCount === 1 ? 'job' : 'jobs'}`}
            </span>
          </div>

          {(confirmationCounts.confirmed > 0 || confirmationCounts.awaiting > 0) && (
            <div className="mt-3 flex flex-wrap gap-2">
              {confirmationCounts.confirmed > 0 && (
                <Badge tone="green">{confirmationCounts.confirmed} confirmed</Badge>
              )}
              {confirmationCounts.awaiting > 0 && (
                <Badge tone="amber">{confirmationCounts.awaiting} awaiting tenant</Badge>
              )}
            </div>
          )}

          <div className="mt-3">
            {overdueCount > 0 ? (
              <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {overdueCount} past date — attend to these first.
              </p>
            ) : riskCount > 0 ? (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <AlertTriangle className="h-4 w-4 shrink-0 text-pill-amber-foreground" />
                {riskCount} {riskCount === 1 ? 'requires' : 'require'} tenant confirmation.
              </p>
            ) : dayCount > 0 ? (
              <p className="text-sm text-muted-foreground">All clear — plan your route.</p>
            ) : (
              <p className="text-sm text-muted-foreground">No work scheduled for this day.</p>
            )}
          </div>
        </Card>
      </div>

      {isIosSafariEligible ? <InstallBannerIos /> : canInstall ? <InstallBannerNative /> : null}

      <div className="px-page-x">
        <FailedSyncBanner />
      </div>

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
                  <div className="rounded-card border border-pill-amber-foreground/20 bg-pill-amber/40 p-4">
                    <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-pill-amber-foreground">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {stuckAppointments.length} incomplete {stuckAppointments.length === 1 ? 'job' : 'jobs'} from previous days
                    </p>
                    <div className="flex flex-col gap-2">
                      {stuckAppointments.map((apt) => (
                        <AppointmentCard key={apt.id} appointment={apt} today={today} />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {!isLoading && !isError && (
                <AppointmentDayList appointments={dayAppointments} today={today} />
              )}
            </div>
          </PullToRefresh>
        </>
      )}

      {tab === 'history' && (
        <PullToRefresh onRefresh={history.refetch}>
          <div className="pb-6 pt-2">
            <div className="px-page-x pb-2">
              <div
                className="grid grid-cols-4 gap-1 rounded-full bg-muted p-1"
                role="tablist"
                aria-label="History period"
              >
                {(
                  [
                    { value: '30d', label: '30d' },
                    { value: '90d', label: '90d' },
                    { value: '12m', label: '12m' },
                    { value: '24m', label: '24m' },
                  ] as const
                ).map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    role="tab"
                    aria-selected={historyPeriod === option.value}
                    onClick={() => setHistoryPeriod(option.value)}
                    className={cn(
                      'rounded-full py-1.5 text-sm font-semibold transition-colors',
                      historyPeriod === option.value
                        ? 'bg-card text-foreground shadow-sm'
                        : 'text-muted-foreground',
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
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
              <>
                <ScheduleHistoryList items={history.items} />
                <div ref={historySentinelRef} aria-hidden="true" />
                {isFetchingNextPage && (
                  <div className="px-page-x pt-2">
                    <LoadingState rows={1} variant="card" />
                  </div>
                )}
                {hasNextPage && !isFetchingNextPage && (
                  <div className="flex justify-center pt-2">
                    <button
                      type="button"
                      onClick={() => fetchNextPage()}
                      className="text-sm font-semibold text-primary"
                    >
                      Load more
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </PullToRefresh>
      )}
    </div>
  );
}
