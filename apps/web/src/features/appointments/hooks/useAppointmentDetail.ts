import { useState, useEffect, useCallback } from 'react';
import type { AppointmentDetail } from '../types';
import { MOCK_APPOINTMENTS } from '../mocks/appointments';

export interface UseAppointmentDetailReturn {
  appointment: AppointmentDetail | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useAppointmentDetail(id: string | null): UseAppointmentDetailReturn {
  const [appointment, setAppointment] = useState<AppointmentDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadCount, setLoadCount] = useState(0);

  const refetch = useCallback(() => {
    setLoadCount((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!id) {
      setAppointment(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const timer = setTimeout(() => {
      const found = MOCK_APPOINTMENTS.find((a) => a.id === id) ?? null;
      setAppointment(found);
      setIsLoading(false);
    }, 200);

    return () => clearTimeout(timer);
  }, [id, loadCount]);

  return { appointment, isLoading, isError: false, refetch };
}
