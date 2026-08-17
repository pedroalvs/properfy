import { useState, useMemo } from 'react';
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

/**
 * The editable body for a template row.
 *
 * SMS is plain text stored in `body_text` (`body_html` is NULL); EMAIL is HTML in
 * `body_html`, with `body_text` holding only the derived plain-text alternative
 * part — showing that in the editor would silently discard the operator's markup
 * on the next save.
 */
function pickBodyForChannel(raw: Record<string, unknown>): string {
  const preferred = raw['channel'] === 'SMS' ? raw['bodyText'] : raw['bodyHtml'];
  return (preferred || raw['bodyText'] || raw['body'] || '') as string;
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

  // PR #961 bug class: memoized so consumers get a stable array per fetch result.
  const templates: NotificationTemplate[] = useMemo(() => (response?.data ?? []).map((raw) => ({
    id: raw['id'] as string,
    tenantId: (raw['tenantId'] as string | null | undefined) ?? null,
    // The list endpoint sends the owning agency as `tenantName` — reading the
    // wrong key here left the Agency column permanently blank.
    tenantName: (raw['tenantName'] as string | null | undefined) ?? null,
    code: (raw['templateCode'] ?? raw['code']) as string,
    channel: raw['channel'] as NotificationTemplate['channel'],
    subject: (raw['subject'] as string) ?? '',
    // Pick the column the channel actually delivers from. This was
    // `bodyHtml ?? bodyText ?? ''`, but the list endpoint flattens a NULL
    // body_html to '' — and '' is not nullish, so `??` never reached bodyText
    // and every SMS template showed a blank Body while the stored copy still
    // went out over the wire. Choose explicitly rather than relying on which
    // operator happens to skip an empty string.
    body: pickBodyForChannel(raw),
    active: (raw['isActive'] ?? raw['active']) as boolean,
    // Feature 018: default to OPERATIONAL if the backend omits the field (legacy rows)
    notificationClass: (raw['notificationClass'] as NotificationTemplate['notificationClass']) ?? 'OPERATIONAL',
    requiredVariables: (raw['variables'] ?? raw['variablesJson'] ?? raw['requiredVariables'] ?? []) as string[],
    createdAt: raw['createdAt'] as string,
    updatedAt: raw['updatedAt'] as string,
  })), [response?.data]);

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
