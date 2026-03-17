import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, type ApiError } from '@/lib/api-client';
import type {
  PortalData,
  ConfirmInput,
  RescheduleInput,
  UpdateContactInput,
  ReportUnavailabilityInput,
} from '../types';

function portalQueryKey(token: string) {
  return ['portal', token];
}

export function usePortalData(token: string) {
  return useQuery<PortalData, ApiError>({
    queryKey: portalQueryKey(token),
    queryFn: () => apiClient.get<PortalData>(`/v1/tenant-portal/${token}`),
    enabled: !!token,
    retry: false,
  });
}

export function useConfirmAppointment(token: string) {
  const queryClient = useQueryClient();

  return useMutation<unknown, ApiError, ConfirmInput>({
    mutationFn: (data) => apiClient.post(`/v1/tenant-portal/${token}/confirm`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalQueryKey(token) });
    },
  });
}

export function useRescheduleRequest(token: string) {
  const queryClient = useQueryClient();

  return useMutation<unknown, ApiError, RescheduleInput>({
    mutationFn: (data) => apiClient.post(`/v1/tenant-portal/${token}/reschedule`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalQueryKey(token) });
    },
  });
}

export function useUpdateContact(token: string) {
  const queryClient = useQueryClient();

  return useMutation<unknown, ApiError, UpdateContactInput>({
    mutationFn: (data) => apiClient.patch(`/v1/tenant-portal/${token}/contact`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalQueryKey(token) });
    },
  });
}

export function useReportUnavailability(token: string) {
  const queryClient = useQueryClient();

  return useMutation<unknown, ApiError, ReportUnavailabilityInput>({
    mutationFn: (data) => apiClient.post(`/v1/tenant-portal/${token}/unavailable`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalQueryKey(token) });
    },
  });
}
