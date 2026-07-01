import { useState } from 'react';
import { usePaginatedQuery, type ListParams } from '@/hooks/useApiQuery';
import { DEFAULT_TEMPLATE_FILTERS, type NotificationTemplate, type TemplateFiltersState } from '../types';

export interface UseTemplateListReturn {
  data: NotificationTemplate[];
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => void;
  filters: TemplateFiltersState;
  setFilters: (filters: TemplateFiltersState) => void;
}

export function useTemplateList(): UseTemplateListReturn {
  const [filters, setFilters] = useState<TemplateFiltersState>(DEFAULT_TEMPLATE_FILTERS);

  const params: ListParams = {
    templateCode: filters.templateCode || undefined,
    channel: filters.channel || undefined,
    includeDefaults: filters.includeDefaults === 'true',
    tenantId: filters.tenantId || undefined,
  };

  const { data: response, isLoading, isError, refetch } = usePaginatedQuery<Record<string, unknown>>(
    ['notification-templates'],
    '/v1/notification-templates',
    params,
  );

  const templates: NotificationTemplate[] = (response?.data ?? []).map((raw) => ({
    id: raw['id'] as string,
    tenantId: (raw['tenantId'] as string | null | undefined) ?? null,
    rentalTenantName: (raw['rentalTenantName'] as string | null | undefined) ?? null,
    code: (raw['templateCode'] ?? raw['code']) as string,
    channel: raw['channel'] as NotificationTemplate['channel'],
    subject: (raw['subject'] as string) ?? '',
    body: (raw['bodyHtml'] ?? raw['bodyText'] ?? raw['body'] ?? '') as string,
    active: (raw['isActive'] ?? raw['active']) as boolean,
    // Feature 018: default to OPERATIONAL if the backend omits the field (legacy rows)
    notificationClass: (raw['notificationClass'] as NotificationTemplate['notificationClass']) ?? 'OPERATIONAL',
    requiredVariables: (raw['variables'] ?? raw['variablesJson'] ?? raw['requiredVariables'] ?? []) as string[],
    createdAt: raw['createdAt'] as string,
    updatedAt: raw['updatedAt'] as string,
  }));

  return {
    data: templates,
    isLoading,
    isError,
    errorMessage: null,
    refetch,
    filters,
    setFilters,
  };
}
