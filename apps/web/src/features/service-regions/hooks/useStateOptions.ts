import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';

export interface SelectOption {
  value: string;
  label: string;
}

export interface UseStateOptionsReturn {
  options: SelectOption[];
  isLoading: boolean;
}

export function useStateOptions(country: string): UseStateOptionsReturn {
  const query = useQuery<{ data: { code: string; name: string }[] }>({
    queryKey: ['geography', 'states', country],
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/geography/states' as any, {
        params: { query: { country } as any },
      });
      if (error) throw error;
      return data as unknown as { data: { code: string; name: string }[] };
    },
    enabled: !!country,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const states = query.data?.data ?? [];

  return {
    options: states.map((s) => ({ value: s.code, label: s.name })),
    isLoading: query.isLoading,
  };
}
