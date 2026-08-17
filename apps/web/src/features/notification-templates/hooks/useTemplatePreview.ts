import { useState, useEffect, useRef } from 'react';
import { api } from '@/services/api';

export interface TemplatePreviewResult {
  subjectRendered: string;
  htmlRendered: string;
  /** Set when the backend could not render (e.g. a Handlebars syntax error). */
  renderError?: string;
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
  // Monotonic request counter: only the newest request may write state, so a
  // slow older response can never overwrite a newer preview.
  const requestSeqRef = useRef(0);

  useEffect(() => {
    if (!bodyHtml.trim() || !code || !channel) {
      setPreview(null);
      return;
    }

    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
    }

    const controller = new AbortController();

    timerRef.current = setTimeout(async () => {
      const seq = ++requestSeqRef.current;
      setIsLoading(true);
      try {
        const { data, error } = await api.POST(
          '/v1/notification-templates/{templateCode}/{channel}/preview',
          {
            params: { path: { templateCode: code, channel } },
            body: {
              bodyHtml,
              subject: subject || undefined,
              tenantId: tenantId ?? undefined,
            },
            signal: controller.signal,
          },
        );
        if (seq !== requestSeqRef.current) return;
        if (!error && data?.data) {
          setPreview(data.data);
        }
      } catch {
        // Network error / abort — don't update preview
      } finally {
        if (seq === requestSeqRef.current) {
          setIsLoading(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
      }
      controller.abort();
    };
  }, [bodyHtml, code, channel, subject, tenantId]);

  return { preview, isLoading };
}
