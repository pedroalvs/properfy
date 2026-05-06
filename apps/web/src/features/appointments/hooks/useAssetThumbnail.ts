import { useQuery } from '@tanstack/react-query';
import { api } from '@/services/api';

export function useAssetThumbnail(
  appointmentId: string,
  assetId: string,
  enabled: boolean,
) {
  const { data, isLoading } = useQuery({
    queryKey: ['appointments', appointmentId, 'assets', assetId, 'thumbnail'],
    queryFn: async () => {
      const { data: res, error } = await api.GET(
        `/v1/appointments/{appointmentId}/assets/{assetId}/download` as never,
        { params: { path: { appointmentId, assetId } } } as never,
      );
      if (error || !res) return null;
      return ((res as { downloadUrl?: string }).downloadUrl) ?? null;
    },
    enabled,
    staleTime: 4 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  return { signedUrl: data ?? null, isLoading };
}
