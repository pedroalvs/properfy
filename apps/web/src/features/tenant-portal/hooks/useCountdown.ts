import { useState, useEffect } from 'react';

interface CountdownResult {
  hours: number;
  minutes: number;
  isExpired: boolean;
  isUrgent: boolean;
  isCritical: boolean;
  label: string;
}

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
    deadline ? calcCountdown(deadline) : { hours: 0, minutes: 0, isExpired: true, isUrgent: true, isCritical: true, label: '' },
  );

  useEffect(() => {
    if (!deadline) return;

    const initial = calcCountdown(deadline);
    setResult(initial);

    if (initial.isExpired) {
      return;
    }

    const interval = setInterval(() => {
      const next = calcCountdown(deadline);
      setResult(next);
      if (next.isExpired) {
        clearInterval(interval);
        onExpire?.();
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, [deadline, onExpire]);

  return result;
}
