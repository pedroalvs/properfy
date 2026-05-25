import { useState, useCallback, useRef } from 'react';
import { api } from '@/services/api';

export interface SendTestSmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface UseSendTestSmsReturn {
  sendTest: (templateCode: string, channel: string, recipientPhone: string) => Promise<SendTestSmsResult>;
  isSending: boolean;
}

export function useSendTestSms(): UseSendTestSmsReturn {
  const [isSending, setIsSending] = useState(false);
  const inflightRef = useRef(false);

  const sendTest = useCallback(async (
    templateCode: string,
    channel: string,
    recipientPhone: string,
  ): Promise<SendTestSmsResult> => {
    if (inflightRef.current) return { success: false, error: 'Already sending' };
    inflightRef.current = true;
    setIsSending(true);
    try {
      const { data, error } = await (api as any).POST(
        `/v1/notification-templates/${templateCode}/${channel}/test-send`,
        { body: { recipientPhone } },
      );
      if (error) throw new Error((error as any)?.error?.message ?? 'Request failed');
      return { success: true, messageId: (data as any)?.data?.messageId };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to send test SMS';
      return { success: false, error: message };
    } finally {
      inflightRef.current = false;
      setIsSending(false);
    }
  }, []);

  return { sendTest, isSending };
}
