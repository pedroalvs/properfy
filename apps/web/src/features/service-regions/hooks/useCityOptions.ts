import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';

export interface SelectOption {
  value: string;
  label: string;
}

export interface UseCityOptionsReturn {
  options: SelectOption[];
  isLoading: boolean;
}

export function useCityOptions(country: string, state: string): UseCityOptionsReturn {
  const query = useQuery<{ data: string[] }>({
    queryKey: ['suburbs', 'cities', country, state],
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/suburbs/cities' as any, {
        params: { query: { country, state } as any },
      });
      if (error) throw error;
      return data as unknown as { data: string[] };
    },
    enabled: !!country && !!state,
  });

  const cities = query.data?.data ?? [];

  return {
    options: cities.map((c) => ({ value: c, label: c })),
    isLoading: query.isLoading,
  };
}
