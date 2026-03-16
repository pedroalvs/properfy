import { useState, useEffect, useCallback } from 'react';
import type { UserDetail } from '../types';
import { MOCK_USERS } from '../mocks/users';

export interface UseUserDetailReturn {
  user: UserDetail | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

export function useUserDetail(id: string | null): UseUserDetailReturn {
  const [user, setUser] = useState<UserDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadCount, setLoadCount] = useState(0);

  const refetch = useCallback(() => {
    setLoadCount((c) => c + 1);
  }, []);

  useEffect(() => {
    if (!id) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    const timer = setTimeout(() => {
      const found = MOCK_USERS.find((u) => u.id === id) ?? null;
      setUser(found);
      setIsLoading(false);
    }, 200);

    return () => clearTimeout(timer);
  }, [id, loadCount]);

  return { user, isLoading, isError: false, refetch };
}
