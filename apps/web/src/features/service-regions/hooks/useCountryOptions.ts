import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';

export interface SelectOption {
  value: string;
  label: string;
}

export interface UseCountryOptionsReturn {
  options: SelectOption[];
  isLoading: boolean;
}

export function useCountryOptions(): UseCountryOptionsReturn {
  const query = useQuery<{ data: { code: string; name: string }[] }>({
    queryKey: ['geography', 'countries'],
    queryFn: async () => {
      const { data, error } = await api.GET('/v1/geography/countries' as any, {});
      if (error) throw error;
      return data as unknown as { data: { code: string; name: string }[] };
    },
    staleTime: Infinity,
  });

  const countries = query.data?.data ?? [];

  return {
    options: countries.map((c) => ({ value: c.code, label: c.name })),
    isLoading: query.isLoading,
  };
}
