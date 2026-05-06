import { useState, useCallback } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/forms/FormField';
import { PhoneInput } from '@/components/forms/PhoneInput';
import { useSnackbar } from '@/hooks/useSnackbar';
import { toE164Au } from '@/lib/phone-mask';
import { useSendTestSms } from '../hooks/useSendTestSms';

interface SendTestSmsDialogProps {
  open: boolean;
  onClose: () => void;
  templateCode: string;
  channel: string;
}

export function SendTestSmsDialog({
  open,
  onClose,
  templateCode,
  channel,
}: SendTestSmsDialogProps) {
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const { sendTest, isSending } = useSendTestSms();
  const { showSuccess, showError } = useSnackbar();

  const handleClose = useCallback(() => {
    setPhone('');
    setPhoneError('');
    onClose();
  }, [onClose]);

  const handlePhoneChange = useCallback((value: string) => {
    setPhone(value);
    if (phoneError) setPhoneError('');
  }, [phoneError]);

  const handleSend = useCallback(async () => {
    const e164 = toE164Au(phone);
    if (!e164) {
      setPhoneError('Please enter a valid Australian phone number');
      return;
    }

    const result = await sendTest(templateCode, channel, e164);
    if (result.success) {
      showSuccess(`Test SMS sent to ${phone}`);
      handleClose();
    } else {
      showError(result.error ?? 'Failed to send test SMS');
    }
  }, [phone, templateCode, channel, sendTest, showSuccess, showError, handleClose]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Send Test SMS"
      maxWidth="420px"
      actions={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={isSending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSend}
            loading={isSending}
            disabled={!phone.trim() || isSending}
          >
            Send
          </Button>
        </>
      }
    >
      <FormField label="Recipient phone (Australian)" error={phoneError}>
        <PhoneInput
          value={phone}
          onChange={handlePhoneChange}
          error={!!phoneError}
          aria-label="Recipient phone"
        />
      </FormField>
    </Dialog>
  );
}
