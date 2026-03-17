import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/services/api';
import type { ApiError } from '@/lib/api-error';
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

async function portalGet<T>(path: string): Promise<T> {
  const { data, error } = await api.GET(path as any, {});
  if (error) throw error;
  return data as T;
}

async function portalPost<T>(path: string, body?: unknown): Promise<T> {
  const { data, error } = await api.POST(path as any, { body: body as any });
  if (error) throw error;
  return data as T;
}

async function portalPatch<T>(path: string, body?: unknown): Promise<T> {
  const { data, error } = await api.PATCH(path as any, { body: body as any });
  if (error) throw error;
  return data as T;
}

export function usePortalData(token: string) {
  return useQuery<PortalData, ApiError>({
    queryKey: portalQueryKey(token),
    queryFn: () => portalGet<PortalData>(`/v1/tenant-portal/${token}`),
    enabled: !!token,
    retry: false,
  });
}

export function useConfirmAppointment(token: string) {
  const queryClient = useQueryClient();

  return useMutation<unknown, ApiError, ConfirmInput>({
    mutationFn: (data) => portalPost(`/v1/tenant-portal/${token}/confirm`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalQueryKey(token) });
    },
  });
}

export function useRescheduleRequest(token: string) {
  const queryClient = useQueryClient();

  return useMutation<unknown, ApiError, RescheduleInput>({
    mutationFn: (data) => portalPost(`/v1/tenant-portal/${token}/reschedule`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalQueryKey(token) });
    },
  });
}

export function useUpdateContact(token: string) {
  const queryClient = useQueryClient();

  return useMutation<unknown, ApiError, UpdateContactInput>({
    mutationFn: (data) => portalPatch(`/v1/tenant-portal/${token}/contact`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalQueryKey(token) });
    },
  });
}

export function useReportUnavailability(token: string) {
  const queryClient = useQueryClient();

  return useMutation<unknown, ApiError, ReportUnavailabilityInput>({
    mutationFn: (data) => portalPost(`/v1/tenant-portal/${token}/unavailable`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: portalQueryKey(token) });
    },
  });
}
