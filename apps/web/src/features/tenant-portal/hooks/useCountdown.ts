import { useState, useEffect } from 'react';

interface CountdownResult {
  hours: number;
  minutes: number;
  isExpired: boolean;
  isUrgent: boolean;
}

function calcCountdown(deadline: string): CountdownResult {
  const now = Date.now();
  const end = new Date(deadline).getTime();
  const diff = end - now;

  if (diff <= 0) {
    return { hours: 0, minutes: 0, isExpired: true, isUrgent: true };
  }

  const totalMinutes = Math.floor(diff / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const isUrgent = diff < 24 * 60 * 60 * 1000;

  return { hours, minutes, isExpired: false, isUrgent };
}

export function useCountdown(deadline: string | undefined): CountdownResult {
  const [result, setResult] = useState<CountdownResult>(() =>
    deadline ? calcCountdown(deadline) : { hours: 0, minutes: 0, isExpired: true, isUrgent: true },
  );

  useEffect(() => {
    if (!deadline) return;

    setResult(calcCountdown(deadline));

    const interval = setInterval(() => {
      const next = calcCountdown(deadline);
      setResult(next);
      if (next.isExpired) {
        clearInterval(interval);
      }
    }, 60_000);

    return () => clearInterval(interval);
  }, [deadline]);

  return result;
}
