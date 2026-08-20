import { useState, useCallback } from 'react';
import { api } from '@/services/api';

export interface TemplateDefaultResult {
  subject: string | null;
  /** Plain text on SMS, HTML on EMAIL — drops straight into the Body field. */
  body: string;
  /**
   * Which level the content came from, so the confirmation can name it:
   * PLATFORM_DEFAULT when an agency override reverts to the platform copy,
   * FACTORY when the platform default itself reverts to the shipped catalog.
   */
  source: 'PLATFORM_DEFAULT' | 'FACTORY';
}

export interface UseTemplateDefaultReturn {
  /** Resolves to null on any failure so the caller leaves the form untouched. */
  fetchDefault: (
    code: string,
    channel: string,
    tenantId: string | null | undefined,
  ) => Promise<TemplateDefaultResult | null>;
  isLoading: boolean;
}

/**
 * Fetches the content a template would revert to. On demand rather than as a
 * standing query — resetting is a user action, and prefetching every row's
 * default while the operator only browses the list would be wasted traffic.
 */
export function useTemplateDefault(): UseTemplateDefaultReturn {
  const [isLoading, setIsLoading] = useState(false);

  const fetchDefault = useCallback(async (
    code: string,
    channel: string,
    tenantId: string | null | undefined,
  ): Promise<TemplateDefaultResult | null> => {
    setIsLoading(true);
    try {
      const { data, error } = await api.GET(
        '/v1/notification-templates/{templateCode}/{channel}/default',
        {
          params: {
            path: { templateCode: code, channel },
            query: tenantId ? { tenantId } : {},
          },
        },
      );
      if (error || !data) return null;
      return data.data ?? null;
    } catch {
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { fetchDefault, isLoading };
}
