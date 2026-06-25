import { useState, useCallback, useRef } from 'react';
import { api } from '@/services/api';

export interface SendTestEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface UseSendTestEmailReturn {
  sendTest: (templateCode: string, channel: string, recipientEmail: string) => Promise<SendTestEmailResult>;
  isSending: boolean;
}

export function useSendTestEmail(): UseSendTestEmailReturn {
  const [isSending, setIsSending] = useState(false);
  const inflightRef = useRef(false);

  const sendTest = useCallback(async (
    templateCode: string,
    channel: string,
    recipientEmail: string,
  ): Promise<SendTestEmailResult> => {
    if (inflightRef.current) return { success: false, error: 'Already sending' };
    inflightRef.current = true;
    setIsSending(true);
    try {
      const { data, error } = await (api as any).POST(
        `/v1/notification-templates/${templateCode}/${channel}/test-send`,
        { body: { recipientEmail } },
      );
      if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
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
