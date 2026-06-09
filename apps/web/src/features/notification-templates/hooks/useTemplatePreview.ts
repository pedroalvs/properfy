import { useState, useEffect, useRef } from 'react';
import { api } from '@/services/api';

export interface TemplatePreviewResult {
  subjectRendered: string;
  htmlRendered: string;
}

export interface UseTemplatePreviewReturn {
  preview: TemplatePreviewResult | null;
  isLoading: boolean;
}

const DEBOUNCE_MS = 400;

/**
 * Debounced hook that fetches a rendered preview from the backend.
 * Returns { preview, isLoading }. Preview HTML is safe to render in a sandboxed iframe.
 */
export function useTemplatePreview(
  code: string,
  channel: string,
  bodyHtml: string,
  subject?: string,
  tenantId?: string | null,
): UseTemplatePreviewReturn {
  const [preview, setPreview] = useState<TemplatePreviewResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestBodyRef = useRef(bodyHtml);

  useEffect(() => {
    latestBodyRef.current = bodyHtml;
  }, [bodyHtml]);

  useEffect(() => {
    if (!bodyHtml.trim() || !code || !channel) {
      setPreview(null);
      return;
    }

    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (api as any).POST(
          `/v1/notification-templates/${code}/${channel}/preview`,
          {
            body: {
              bodyHtml,
              subject: subject || undefined,
              tenantId: tenantId ?? undefined,
            },
          },
        );
        if (!error && data) {
          const result = data as { data?: TemplatePreviewResult };
          if (result.data) {
            setPreview(result.data);
          }
        }
      } catch {
        // Network error — don't update preview
      } finally {
        setIsLoading(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
    };
  }, [bodyHtml, code, channel, subject, tenantId]);

  return { preview, isLoading };
}
