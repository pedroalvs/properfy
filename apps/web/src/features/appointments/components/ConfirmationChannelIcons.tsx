interface ConfirmationChannelIconsProps {
  /** Tenant portal confirmation status — drives both icons until per-channel
   *  statuses are exposed by the list endpoint (see plan §step 5 GAP-405). */
  rentalTenantConfirmationStatus?: string;
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

function labelFor(status: string | undefined, channel: 'SMS' | 'Email', hasChannel: boolean): string {
  if (!hasChannel) {
    return channel === 'SMS' ? 'SMS — no phone number on file' : 'Email — no email address on file';
  }
  switch ((status ?? '').toUpperCase()) {
    case 'CONFIRMED': return `${channel} — Tenant confirmed`;
    case 'DECLINED': return `${channel} — Tenant declined`;
    case 'RESCHEDULE_REQUESTED': return `${channel} — Reschedule requested by tenant`;
    case 'UNAVAILABLE': return `${channel} — Tenant marked as unavailable`;
    case 'NO_RESPONSE': return `${channel} — No response from tenant`;
    case 'PENDING':
    default: return `${channel} — Awaiting tenant response`;
  }
}

export function IconWithTooltip({ icon, label, colour, testId }: { icon: string; label: string; colour: string; testId?: string }) {
  return (
    <span className="group relative inline-flex">
      <i className={`mdi ${icon} cursor-help text-base ${colour}`} aria-label={label} data-testid={testId} />
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100"
      >
        {label}
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
      </span>
    </span>
  );
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
  rentalTenantConfirmationStatus,
  hasEmail = true,
  hasSms = true,
}: ConfirmationChannelIconsProps) {
  const smsState = deriveState(rentalTenantConfirmationStatus, hasSms);
  const emailState = deriveState(rentalTenantConfirmationStatus, hasEmail);
  return (
    <span className="inline-flex items-center gap-1" data-testid="confirmation-channel-icons">
      <IconWithTooltip
        icon="mdi-cellphone-message"
        label={labelFor(rentalTenantConfirmationStatus, 'SMS', hasSms)}
        colour={colourFor(smsState)}
        testId="confirmation-sms-icon"
      />
      <IconWithTooltip
        icon="mdi-email-outline"
        label={labelFor(rentalTenantConfirmationStatus, 'Email', hasEmail)}
        colour={colourFor(emailState)}
        testId="confirmation-email-icon"
      />
    </span>
  );
}
