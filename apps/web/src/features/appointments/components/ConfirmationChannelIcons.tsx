interface ConfirmationChannelIconsProps {
  /** Tenant portal confirmation status — drives both icons until per-channel
   *  statuses are exposed by the list endpoint (see plan §step 5 GAP-405). */
  tenantConfirmationStatus?: string;
  hasEmail?: boolean;
  hasSms?: boolean;
}

type ChannelState = 'sent' | 'failed' | 'pending' | 'missing';

function colourFor(state: ChannelState): string {
  switch (state) {
    case 'sent': return 'text-green-600';
    case 'failed': return 'text-red-600';
    case 'pending': return 'text-gray-400';
    case 'missing': return 'text-gray-300';
  }
}

function deriveState(status: string | undefined, hasChannel: boolean): ChannelState {
  if (!hasChannel) return 'missing';
  switch ((status ?? '').toUpperCase()) {
    case 'CONFIRMED': return 'sent';
    case 'DECLINED':
    case 'RESCHEDULE_REQUESTED':
    case 'UNAVAILABLE': return 'failed';
    case 'PENDING':
    default: return 'pending';
  }
}

/**
 * 025 — two inline icons (📱 SMS, 📧 Email) coloured red/green/gray
 * based on the tenant portal confirmation state. Pre-fix the modal had
 * no signal at all; this is the minimum useful representation until
 * the list endpoint exposes per-channel statuses (GAP-405).
 *
 * Icon palette taken from the existing mdi set so the chip matches the
 * rest of the app visually without introducing a new icon library.
 */
export function ConfirmationChannelIcons({
  tenantConfirmationStatus,
  hasEmail = true,
  hasSms = true,
}: ConfirmationChannelIconsProps) {
  const smsState = deriveState(tenantConfirmationStatus, hasSms);
  const emailState = deriveState(tenantConfirmationStatus, hasEmail);
  return (
    <span className="inline-flex items-center gap-1" data-testid="confirmation-channel-icons">
      <i
        className={`mdi mdi-cellphone-message text-base ${colourFor(smsState)}`}
        aria-label={`SMS ${smsState}`}
        title={`SMS ${smsState}`}
      />
      <i
        className={`mdi mdi-email-outline text-base ${colourFor(emailState)}`}
        aria-label={`Email ${emailState}`}
        title={`Email ${emailState}`}
      />
    </span>
  );
}
