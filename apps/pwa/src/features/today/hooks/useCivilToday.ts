import { useEffect, useState, useCallback } from 'react';
import { todayInTzDateString } from '@properfy/shared';
import { useEffectiveTimezone } from '@/hooks/useEffectiveTimezone';

/** Milliseconds from now until the next civil midnight in `tz` (+1s buffer). */
function msToNextCivilMidnight(tz: string): number {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  const hour = get('hour') === 24 ? 0 : get('hour');
  const secondsIntoDay = hour * 3600 + get('minute') * 60 + get('second');
  const secondsLeft = 24 * 3600 - secondsIntoDay;
  return secondsLeft * 1000 - now.getMilliseconds() + 1000;
}

/**
 * Today's civil date (`YYYY-MM-DD`) in the inspector's effective timezone, never
 * the device timezone. Recomputes when the tab becomes visible, on window focus,
 * and via a self-rescheduling timer at the next civil midnight — so a day plan
 * left open overnight rolls over to the new date on its own.
 */
export function useCivilToday(timezoneOverride?: string): string {
  const effectiveTz = useEffectiveTimezone();
  const tz = timezoneOverride ?? effectiveTz;
  const [today, setToday] = useState(() => todayInTzDateString(tz));

  const recompute = useCallback(() => {
    setToday(todayInTzDateString(tz));
  }, [tz]);

  useEffect(() => {
    recompute();

    const onVisible = () => {
      if (document.visibilityState === 'visible') recompute();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', recompute);

    let timer: ReturnType<typeof setTimeout>;
    const scheduleMidnight = () => {
      timer = setTimeout(() => {
        recompute();
        scheduleMidnight();
      }, msToNextCivilMidnight(tz));
    };
    scheduleMidnight();

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', recompute);
      clearTimeout(timer);
    };
  }, [tz, recompute]);

  return today;
}
