import { useState, useCallback } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { FormField } from '@/components/forms/FormField';
import { TextInput } from '@/components/forms/TextInput';
import { useSnackbar } from '@/hooks/useSnackbar';
import { useSendTestEmail } from '../hooks/useSendTestEmail';

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

interface SendTestEmailDialogProps {
  open: boolean;
  onClose: () => void;
  templateCode: string;
  channel: string;
}

export function SendTestEmailDialog({
  open,
  onClose,
  templateCode,
  channel,
}: SendTestEmailDialogProps) {
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState('');
  const { sendTest, isSending } = useSendTestEmail();
  const { showSuccess, showError } = useSnackbar();

  const handleClose = useCallback(() => {
    setEmail('');
    setEmailError('');
    onClose();
  }, [onClose]);

  const handleEmailChange = useCallback((value: string) => {
    setEmail(value);
    if (emailError) setEmailError('');
  }, [emailError]);

  const handleSend = useCallback(async () => {
    if (!EMAIL_RE.test(email)) {
      setEmailError('Please enter a valid email address');
      return;
    }
    const result = await sendTest(templateCode, channel, email);
    if (result.success) {
      showSuccess(`Test email sent to ${email}`);
      handleClose();
    } else {
      showError(result.error ?? 'Failed to send test email');
    }
  }, [email, templateCode, channel, sendTest, showSuccess, showError, handleClose]);

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Send Test Email"
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
            disabled={!email.trim() || isSending}
          >
            Send
          </Button>
        </>
      }
    >
      <FormField label="Recipient email" error={emailError}>
        <TextInput
          type="email"
          value={email}
          onChange={handleEmailChange}
          placeholder="recipient@example.com"
          error={!!emailError}
          autoFocus
          aria-label="Recipient email"
        />
      </FormField>
    </Dialog>
  );
}
