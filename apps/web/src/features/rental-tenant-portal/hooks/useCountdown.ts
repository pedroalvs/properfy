import { useState, useEffect } from 'react';

interface CountdownResult {
  hours: number;
  minutes: number;
  isExpired: boolean;
  isUrgent: boolean;
  isCritical: boolean;
  label: string;
}

// Shared empty/expired baseline — also the reset state when the deadline clears.
const EMPTY_RESULT: CountdownResult = {
  hours: 0,
  minutes: 0,
  isExpired: true,
  isUrgent: true,
  isCritical: true,
  label: '',
};

// setTimeout overflows (fires immediately) past 2^31-1 ms (~24.8 days). Portal
// deadlines are days away at most, but guard anyway and let the interval re-arm.
const MAX_TIMEOUT_MS = 2_147_483_647;

function formatLabel(hours: number, minutes: number): string {
  if (hours > 0) {
    return `Respond within ${hours} hour${hours !== 1 ? 's' : ''} ${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }
  return `Respond within ${minutes} minute${minutes !== 1 ? 's' : ''}`;
}

function calcCountdown(deadline: string): CountdownResult {
  const now = Date.now();
  const end = new Date(deadline).getTime();
  const diff = end - now;

  if (diff <= 0) {
    return { hours: 0, minutes: 0, isExpired: true, isUrgent: true, isCritical: true, label: '' };
  }

  const totalMinutes = Math.floor(diff / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const isUrgent = diff < 24 * 60 * 60 * 1000;
  const isCritical = diff < 2 * 60 * 60 * 1000;
  const label = formatLabel(hours, minutes);

  return { hours, minutes, isExpired: false, isUrgent, isCritical, label };
}

export function useCountdown(deadline: string | undefined, onExpire?: () => void): CountdownResult {
  const [result, setResult] = useState<CountdownResult>(() =>
    deadline ? calcCountdown(deadline) : EMPTY_RESULT,
  );

  useEffect(() => {
    // Deadline cleared (e.g. a refetch dropped it): reset to the baseline instead
    // of leaving the last computed label/minutes stale on screen.
    if (!deadline) {
      setResult(EMPTY_RESULT);
      return;
    }

    const initial = calcCountdown(deadline);
    setResult(initial);
    if (initial.isExpired) return;

    let fired = false;

    // Fire expiry exactly once, whether the precise timer or a 60s tick gets there
    // first (they coincide when the deadline lands on a tick boundary).
    const fireExpiry = (): void => {
      if (fired) return;
      fired = true;
      setResult(calcCountdown(deadline));
      onExpire?.();
    };

    // 60s ticks keep the label fresh; they also cover deadlines too far out for a
    // single setTimeout (the precise timer below is skipped there). Self-clears
    // once expired.
    const interval = setInterval(() => {
      const next = calcCountdown(deadline);
      setResult(next);
      if (next.isExpired) {
        clearInterval(interval);
        fireExpiry();
      }
    }, 60_000);

    // Precise expiry at the real deadline, so onExpire does not wait up to ~60s.
    const remainingMs = new Date(deadline).getTime() - Date.now();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    if (remainingMs > 0 && remainingMs <= MAX_TIMEOUT_MS) {
      timeout = setTimeout(() => {
        clearInterval(interval);
        fireExpiry();
      }, remainingMs);
    }

    return () => {
      clearInterval(interval);
      if (timeout) clearTimeout(timeout);
    };
  }, [deadline, onExpire]);

  return result;
}
