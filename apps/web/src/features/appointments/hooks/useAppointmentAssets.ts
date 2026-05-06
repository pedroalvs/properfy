import { useDetailQuery } from '@/hooks/useApiQuery';

export interface InspectionAsset {
  id: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number | null;
  kind: string;
  status: string;
  originalFilename: string | null;
  createdAt: string;
}

export function useAppointmentAssets(appointmentId: string | null) {
  const { data, isLoading, isError, refetch } = useDetailQuery<InspectionAsset[]>(
    ['appointments', appointmentId ?? '', 'assets'],
    `/v1/appointments/${appointmentId}/assets` as never,
    { enabled: !!appointmentId },
  );

  return {
    assets: data?.data ?? [],
    isLoading,
    isError,
    refetch,
  };
}
