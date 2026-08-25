import { useState, useMemo } from 'react';
import type { paths } from '@properfy/shared';
import { usePaginatedQuery, type ListParams } from '@/hooks/useApiQuery';
import { DEFAULT_TEMPLATE_FILTERS, type NotificationTemplate, type TemplateFiltersState } from '../types';

/**
 * The list row shape straight from the OpenAPI contract. Using the generated
 * type (instead of `Record<string, unknown>`) means a response-field rename —
 * e.g. `tenantName` — fails type checking here rather than silently rendering
 * the Agency fallback.
 */
type TemplateListItem =
  paths['/v1/notification-templates']['get']['responses'][200]['content']['application/json']['data'][number];

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
function pickBodyForChannel(raw: TemplateListItem): string {
  const preferred = raw.channel === 'SMS' ? raw.bodyText : raw.bodyHtml;
  return preferred || raw.bodyText || '';
}

export function useTemplateList(): UseTemplateListReturn {
  const [filters, setFilters] = useState<TemplateFiltersState>(DEFAULT_TEMPLATE_FILTERS);

  const params: ListParams = {
    templateCode: filters.templateCode || undefined,
    channel: filters.channel || undefined,
    includeDefaults: filters.includeDefaults === 'true',
    tenantId: filters.tenantId || undefined,
  };

  const { data: response, isLoading, isError, refetch } = usePaginatedQuery<TemplateListItem>(
    ['notification-templates'],
    '/v1/notification-templates',
    params,
  );

  // PR #961 bug class: memoized so consumers get a stable array per fetch result.
  const templates: NotificationTemplate[] = useMemo(() => (response?.data ?? []).map((raw) => ({
    id: raw.id,
    tenantId: raw.tenantId ?? null,
    // The list endpoint sends the owning agency as `tenantName` — reading the
    // wrong key here left the Agency column permanently blank.
    tenantName: raw.tenantName ?? null,
    code: raw.templateCode,
    channel: raw.channel as NotificationTemplate['channel'],
    subject: raw.subject ?? '',
    // Pick the column the channel actually delivers from. This was
    // `bodyHtml ?? bodyText ?? ''`, but the list endpoint flattens a NULL
    // body_html to '' — and '' is not nullish, so `??` never reached bodyText
    // and every SMS template showed a blank Body while the stored copy still
    // went out over the wire. Choose explicitly rather than relying on which
    // operator happens to skip an empty string.
    body: pickBodyForChannel(raw),
    active: raw.isActive,
    // Feature 018: default to OPERATIONAL if the backend omits the field (legacy rows)
    notificationClass: raw.notificationClass ?? 'OPERATIONAL',
    requiredVariables: (raw.variables ?? raw.variablesJson ?? []) as string[],
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
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
