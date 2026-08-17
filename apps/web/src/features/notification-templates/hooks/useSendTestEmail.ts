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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (api as any).POST(
        `/v1/notification-templates/${templateCode}/${channel}/test-send`,
        {
          body: {
            recipientEmail,
            tenantId: options?.tenantId ?? undefined,
            draftSubject: options?.draftSubject || undefined,
            draftBodyHtml: options?.draftBodyHtml || undefined,
          },
        },
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { success: true, messageId: (data as any)?.data?.messageId };
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
