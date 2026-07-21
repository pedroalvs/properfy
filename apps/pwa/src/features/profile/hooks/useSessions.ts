import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useCallback } from 'react';
import { api } from '@/services/api';
import { toApiError, getErrorMessage } from '@/lib/api-error';

export interface Session {
  id: string;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: string;
  isCurrent: boolean;
}

export function useSessions() {
  const queryClient = useQueryClient();
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const query = useQuery<Session[]>({
    queryKey: ['auth', 'sessions'],
    queryFn: async () => {
      const { data, error, response } = await api.GET('/v1/auth/sessions' as any, {} as any);
      if (error) {
        const apiError = toApiError(error, response?.status);
        apiError.message = getErrorMessage(apiError, 'Failed to load sessions');
        throw apiError;
      }
      const result = data as any;
      return (result?.data ?? []) as Session[];
    },
    staleTime: 60_000,
  });

  const revokeSession = useCallback(async (sessionId: string) => {
    setRevokingId(sessionId);
    try {
      const { error, response } = await api.DELETE('/v1/auth/sessions/{sessionId}' as any, {
        params: { path: { sessionId } } as any,
      });
      if (error) {
        const apiError = toApiError(error, response?.status);
        apiError.message = getErrorMessage(apiError, 'Failed to revoke session');
        throw apiError;
      }
      await queryClient.invalidateQueries({ queryKey: ['auth', 'sessions'] });
    } finally {
      setRevokingId(null);
    }
  }, [queryClient]);

  return {
    sessions: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    revokeSession,
    revokingId,
  };
}
