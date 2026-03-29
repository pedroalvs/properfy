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
  const query = useQuery<{ data: { name: string; latitude: string | null; longitude: string | null }[] }>({
    queryKey: ['geography', 'cities', country, state],
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/geography/cities' as any, {
        params: { query: { country, state } as any },
      });
      if (error) throw error;
      return data as unknown as { data: { name: string; latitude: string | null; longitude: string | null }[] };
    },
    enabled: !!country && !!state,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const cities = query.data?.data ?? [];

  return {
    options: cities.map((c) => ({ value: c.name, label: c.name })),
    isLoading: query.isLoading,
  };
}
