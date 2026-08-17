import { useState, useCallback, useRef } from 'react';
import { api } from '@/services/api';

export interface SendTestEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface SendTestEmailOptions {
  /** Tenant scope of the template under test (agency override). Omitted = platform. */
  tenantId?: string | null;
  /** Unsaved editor draft — the test sends exactly what is on screen. */
  draftSubject?: string;
  draftBodyHtml?: string;
}

export interface UseSendTestEmailReturn {
  sendTest: (
    templateCode: string,
    channel: string,
    recipientEmail: string,
    options?: SendTestEmailOptions,
  ) => Promise<SendTestEmailResult>;
  isSending: boolean;
}

export function useSendTestEmail(): UseSendTestEmailReturn {
  const [isSending, setIsSending] = useState(false);
  const inflightRef = useRef(false);

  const sendTest = useCallback(async (
    templateCode: string,
    channel: string,
    recipientEmail: string,
    options?: SendTestEmailOptions,
  ): Promise<SendTestEmailResult> => {
    if (inflightRef.current) return { success: false, error: 'Already sending' };
    inflightRef.current = true;
    setIsSending(true);
    try {
      const { data, error } = await api.POST(
        '/v1/notification-templates/{templateCode}/{channel}/test-send',
        {
          params: { path: { templateCode, channel } },
          body: {
            recipientEmail,
            tenantId: options?.tenantId ?? undefined,
            // The schema requires min-1 strings; an empty editor field is an
            // unsendable/unsavable state, so it means "no draft for this field".
            draftSubject: options?.draftSubject || undefined,
            draftBodyHtml: options?.draftBodyHtml || undefined,
          },
        },
      );
      if (error) throw new Error((error as { error?: { message?: string } })?.error?.message ?? 'Request failed');
      return { success: true, messageId: data?.data?.messageId };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send test email';
      return { success: false, error: message };
    } finally {
      inflightRef.current = false;
      setIsSending(false);
    }
  }, []);

  return { sendTest, isSending };
}
